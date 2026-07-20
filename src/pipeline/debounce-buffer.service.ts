import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import type { Queue } from 'bullmq';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../common/redis.module';
import type { EnvConfig } from '../config/env.schema';
import { JOB_PROCESS_TURN, QUEUE_INBOUND } from '../queues/queues.constants';
import type { DebounceEntry, TurnJobData } from './pipeline.types';

const LOCK_TTL_MS = 60_000;
/** Si el lock de un lead está tomado, reintentar el turno pronto en vez de perderlo. */
const LOCK_RETRY_DELAY_MS = 2_000;
/**
 * Si al hacer flush la entrada más vieja del buffer lleva más que esto
 * esperando, algo la dejó varada (job huérfano, worker caído, deploy a mitad
 * de un turno): no es un timing normal de debounce (6s por default). Se
 * procesa igual —el mensaje del lead es real y merece respuesta— pero se
 * loguea fuerte para poder rastrear el incidente (ver bug de mensajes
 * "fantasma" del 2026-07-20).
 */
const STALE_ENTRY_THRESHOLD_MS = 5 * 60 * 1000;

@Injectable()
export class DebounceBufferService {
  private readonly logger = new Logger(DebounceBufferService.name);
  private readonly debounceMs: number;

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @InjectQueue(QUEUE_INBOUND)
    private readonly inboundQueue: Queue<TurnJobData>,
    config: ConfigService<EnvConfig, true>,
  ) {
    this.debounceMs = config.get('DEBOUNCE_SECONDS', { infer: true }) * 1000;
  }

  /** Agrega un mensaje al buffer del lead y (re)programa el disparo del turno. */
  async push(
    tenantId: string,
    leadId: string,
    entry: DebounceEntry,
  ): Promise<void> {
    await this.redis.rpush(
      this.bufferKey(tenantId, leadId),
      JSON.stringify(entry),
    );
    await this.scheduleTurn(tenantId, leadId, this.debounceMs);
  }

  /**
   * Intenta procesar el turno acumulado de un lead. Si otro proceso tiene el
   * lock, reencola el turno para reintentar en vez de perder los mensajes.
   */
  async tryFlush(
    tenantId: string,
    leadId: string,
    handler: (entries: DebounceEntry[]) => void | Promise<void>,
  ): Promise<void> {
    const locked = await this.acquireLock(tenantId, leadId);
    if (!locked) {
      this.logger.warn(
        { tenantId, leadId },
        'Lock activo para el lead, reencolando el turno',
      );
      await this.scheduleRetry(tenantId, leadId);
      return;
    }

    try {
      // Ya vamos a flushear ahora: cualquier retry pendiente de un lock
      // anterior quedaría redundante (y si no se cancela, es exactamente el
      // tipo de job huérfano que termina flusheando un buffer ya vacío o
      // pisado más tarde, sin ningún mensaje entrante real de por medio).
      await this.cancelPendingRetry(tenantId, leadId);

      const entries = await this.popAll(tenantId, leadId);
      if (entries.length === 0) {
        return;
      }

      const oldestAgeMs = this.oldestEntryAgeMs(entries);
      if (oldestAgeMs >= STALE_ENTRY_THRESHOLD_MS) {
        this.logger.error(
          { tenantId, leadId, oldestAgeMs, entryCount: entries.length },
          'Se flusheó un turno con entradas mucho más viejas que el debounce normal: posible job huérfano o worker caído a mitad de un turno anterior',
        );
      }

      await handler(entries);
    } finally {
      await this.releaseLock(tenantId, leadId);
    }
  }

  private oldestEntryAgeMs(entries: DebounceEntry[]): number {
    const oldestCreatedAt = Math.min(
      ...entries.map((entry) => new Date(entry.createdAt).getTime()),
    );
    return Date.now() - oldestCreatedAt;
  }

  /**
   * Borra el buffer, el lock y cancela el job delayed pendiente de un lead.
   * Usado por la supresión de leads (derecho de Ley 25.326): sin esto, un
   * turno acumulado podría dispararse igual después de borrado el lead.
   */
  async purgeLead(tenantId: string, leadId: string): Promise<void> {
    await this.redis.del(this.bufferKey(tenantId, leadId));
    await this.redis.del(this.lockKey(tenantId, leadId));
    await this.removeJobIfExists(this.turnJobId(tenantId, leadId));
    await this.cancelPendingRetry(tenantId, leadId);
  }

  private async popAll(
    tenantId: string,
    leadId: string,
  ): Promise<DebounceEntry[]> {
    const key = this.bufferKey(tenantId, leadId);
    const raw = await this.redis.lrange(key, 0, -1);
    await this.redis.del(key);
    return raw.map((item) => JSON.parse(item) as DebounceEntry);
  }

  private async scheduleTurn(
    tenantId: string,
    leadId: string,
    delayMs: number,
  ): Promise<void> {
    // Un mensaje nuevo y real siempre reemplaza cualquier retry pendiente: si
    // no se cancelara, ese retry podía sobrevivir "huérfano" y disparar más
    // tarde sobre un buffer ya vaciado o pisado por este mismo push, sin
    // ningún mensaje entrante de por medio (bug de mensajes "fantasma").
    await this.cancelPendingRetry(tenantId, leadId);
    await this.removeJobIfExists(this.turnJobId(tenantId, leadId));
    await this.inboundQueue.add(
      JOB_PROCESS_TURN,
      { tenantId, leadId },
      { delay: delayMs, jobId: this.turnJobId(tenantId, leadId) },
    );
  }

  /**
   * Reencola el turno cuando el lock está ocupado. Se llama desde dentro del
   * propio job 'process-turn' que sigue activo, así que no puede reusar el
   * jobId canónico (BullMQ no permite que un job en curso se reemplace a sí
   * mismo). Usa un id fijo derivado (NO random) para que quede trackeable:
   * `purgeLead` y cualquier flush posterior lo pueden encontrar y cancelar
   * explícitamente en vez de dejarlo flotando como job huérfano (causa del
   * bug de mensajes "fantasma" del 2026-07-20: un retry sin id rastreable
   * sobrevivía y terminaba flusheando un buffer viejo minutos/horas después,
   * sin ningún mensaje entrante real).
   */
  private async scheduleRetry(tenantId: string, leadId: string): Promise<void> {
    const jobId = this.retryJobId(tenantId, leadId);
    // Id fijo: si ya hay un retry agendado (p.ej. dos flushes seguidos
    // chocaron con el lock), no acumulamos otro, evitamos duplicar el envío.
    await this.removeJobIfExists(jobId);
    await this.inboundQueue.add(
      JOB_PROCESS_TURN,
      { tenantId, leadId },
      { delay: LOCK_RETRY_DELAY_MS, jobId },
    );
  }

  private async cancelPendingRetry(
    tenantId: string,
    leadId: string,
  ): Promise<void> {
    await this.removeJobIfExists(this.retryJobId(tenantId, leadId));
  }

  private async removeJobIfExists(jobId: string): Promise<void> {
    const existing = await this.inboundQueue.getJob(jobId);
    if (!existing) {
      return;
    }
    // BullMQ no reemplaza un job si ya existe uno con el mismo id (aunque
    // esté completed/failed, `add` devuelve el job viejo en vez de crear uno
    // nuevo), así que siempre hay que sacarlo de encima antes de reprogramar.
    // Si está `active` (un worker ya lo tomó), `remove()` tira error: lo
    // tragamos, ese job en curso va a terminar solo.
    await existing.remove().catch(() => undefined);
  }

  private async acquireLock(
    tenantId: string,
    leadId: string,
  ): Promise<boolean> {
    const result = await this.redis.set(
      this.lockKey(tenantId, leadId),
      '1',
      'PX',
      LOCK_TTL_MS,
      'NX',
    );
    return result === 'OK';
  }

  private async releaseLock(tenantId: string, leadId: string): Promise<void> {
    await this.redis.del(this.lockKey(tenantId, leadId));
  }

  private bufferKey(tenantId: string, leadId: string): string {
    return `debounce:${tenantId}:${leadId}`;
  }

  private lockKey(tenantId: string, leadId: string): string {
    return `debounce:lock:${tenantId}:${leadId}`;
  }

  private turnJobId(tenantId: string, leadId: string): string {
    // BullMQ no permite ':' en un jobId custom.
    return `turn__${tenantId}__${leadId}`;
  }

  private retryJobId(tenantId: string, leadId: string): string {
    return `${this.turnJobId(tenantId, leadId)}__retry`;
  }
}
