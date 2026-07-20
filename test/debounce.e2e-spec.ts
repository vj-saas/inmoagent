import 'dotenv/config';
import { getQueueToken } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { Queue, Worker } from 'bullmq';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../src/common/redis.module';
import { DebounceBufferService } from '../src/pipeline/debounce-buffer.service';
import type { DebounceEntry } from '../src/pipeline/pipeline.types';
import {
  JOB_PROCESS_TURN,
  QUEUE_INBOUND,
} from '../src/queues/queues.constants';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('DebounceBuffer (e2e, timing real contra Redis)', () => {
  // Ventana reducida (vs. DEBOUNCE_SECONDS=6 de prod) para que el test corra rápido;
  // la lógica ejercida es la misma, sólo cambia el valor de configuración inyectado.
  const DEBOUNCE_MS = 800;
  let redis: Redis;
  let queue: Queue;
  let worker: Worker;
  let service: DebounceBufferService;
  const turns: { leadId: string; entries: DebounceEntry[] }[] = [];

  beforeAll(async () => {
    redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6381', {
      maxRetriesPerRequest: null,
    });
    // Nombre de cola real aislado (no `QUEUE_INBOUND`) para no colisionar con un
    // server real corriendo contra el mismo Redis; sólo el token de DI debe
    // coincidir con lo que `@InjectQueue(QUEUE_INBOUND)` espera.
    const testQueueName = `inbound-debounce-test-${Date.now()}`;
    queue = new Queue(testQueueName, { connection: redis });

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        DebounceBufferService,
        { provide: REDIS_CLIENT, useValue: redis },
        { provide: getQueueToken(QUEUE_INBOUND), useValue: queue },
        { provide: ConfigService, useValue: { get: () => DEBOUNCE_MS / 1000 } },
      ],
    }).compile();
    service = moduleRef.get(DebounceBufferService);

    worker = new Worker(
      testQueueName,
      async (job) => {
        if (job.name !== JOB_PROCESS_TURN) return;
        const { tenantId, leadId } = job.data as {
          tenantId: string;
          leadId: string;
        };
        await service.tryFlush(tenantId, leadId, (entries) => {
          turns.push({ leadId, entries });
        });
      },
      { connection: redis },
    );
    await worker.waitUntilReady();
  });

  afterAll(async () => {
    await worker.close();
    await queue.obliterate({ force: true }).catch(() => undefined);
    await queue.close();
    await redis.quit();
  });

  function entry(messageId: string, body: string): DebounceEntry {
    return {
      messageId,
      body,
      type: 'TEXT',
      createdAt: new Date().toISOString(),
    };
  }

  it('5 mensajes dentro de la ventana de debounce forman un solo turno, concatenado en orden', async () => {
    const tenantId = 'debounce-e2e-tenant';
    const leadId = `lead-grouped-${Date.now()}`;
    const spacingMs = DEBOUNCE_MS / 5; // 5 mensajes bien dentro de la ventana

    for (let i = 1; i <= 5; i++) {
      await service.push(tenantId, leadId, entry(`m${i}`, `msg${i}`));
      await sleep(spacingMs);
    }
    await sleep(DEBOUNCE_MS + 500);

    const leadTurns = turns.filter((t) => t.leadId === leadId);
    expect(leadTurns).toHaveLength(1);
    expect(leadTurns[0].entries.map((e) => e.body)).toEqual([
      'msg1',
      'msg2',
      'msg3',
      'msg4',
      'msg5',
    ]);
  }, 15000);

  it('un mensaje que llega después de vencida la ventana genera un segundo turno', async () => {
    const tenantId = 'debounce-e2e-tenant';
    const leadId = `lead-split-${Date.now()}`;

    await service.push(tenantId, leadId, entry('m1', 'primero'));
    await sleep(DEBOUNCE_MS + 500); // deja que dispare el primer turno

    await service.push(tenantId, leadId, entry('m2', 'segundo'));
    await sleep(DEBOUNCE_MS + 500);

    const leadTurns = turns.filter((t) => t.leadId === leadId);
    expect(leadTurns).toHaveLength(2);
    expect(leadTurns[0].entries.map((e) => e.body)).toEqual(['primero']);
    expect(leadTurns[1].entries.map((e) => e.body)).toEqual(['segundo']);
  }, 15000);

  it('si el lock del lead está tomado cuando dispara el turno, se reencola en vez de perderse', async () => {
    const tenantId = 'debounce-e2e-tenant';
    const leadId = `lead-lock-${Date.now()}`;
    const lockKey = `debounce:lock:${tenantId}:${leadId}`;

    await service.push(tenantId, leadId, entry('m1', 'contenido'));
    // Simula otro worker procesando este lead: toma el lock ANTES de que dispare el turno
    // (t=0..1500ms), cubriendo el primer intento (t≈800ms) pero liberándose antes del reintento (t≈2800ms).
    await redis.set(lockKey, '1', 'PX', 1500, 'NX');

    await sleep(DEBOUNCE_MS + 300); // t≈1100ms: el turno ya disparó y encontró el lock ocupado
    expect(turns.filter((t) => t.leadId === leadId)).toHaveLength(0);

    await sleep(2500); // t≈3600ms: el reintento (a los 2s del primer intento) ya debería haber procesado

    const leadTurns = turns.filter((t) => t.leadId === leadId);
    expect(leadTurns).toHaveLength(1);
    expect(leadTurns[0].entries.map((e) => e.body)).toEqual(['contenido']);
  }, 15000);

  it('un mensaje nuevo cancela el job de retry huérfano en vez de dejarlo flotando (bug de mensajes fantasma del 2026-07-20)', async () => {
    const tenantId = 'debounce-e2e-tenant';
    const leadId = `lead-orphan-retry-${Date.now()}`;
    const lockKey = `debounce:lock:${tenantId}:${leadId}`;
    // Mismo formato que `retryJobId()` en DebounceBufferService: antes del fix
    // este id era random (`__retry__<hex>`) y por eso no había forma de
    // encontrarlo ni cancelarlo desde otro lado.
    const retryJobId = `turn__${tenantId}__${leadId}__retry`;

    await service.push(tenantId, leadId, entry('m1', 'primero'));
    // Lock ocupado durante toda la ventana del turno canónico Y del primer
    // tramo del retry, para que el job de retry quede agendado (delayed) sin
    // disparar todavía cuando lo inspeccionamos.
    await redis.set(lockKey, '1', 'PX', DEBOUNCE_MS + 2500, 'NX');
    await sleep(DEBOUNCE_MS + 300); // el canónico ya disparó, encontró el lock ocupado y agendó el retry

    const retryJobBeforeSecondPush = await queue.getJob(retryJobId);
    expect(retryJobBeforeSecondPush).not.toBeUndefined();

    // Se libera el lock y llega un mensaje nuevo y real ANTES de que el retry dispare.
    await redis.del(lockKey);
    await service.push(tenantId, leadId, entry('m2', 'segundo'));

    // El push debe haber cancelado el retry huérfano: sin el fix, este job
    // sobrevivía sin que nada lo pudiera encontrar (id random) y terminaba
    // flusheando el buffer más tarde por su cuenta, desacoplado de cualquier
    // mensaje entrante real. BullMQ devuelve `undefined` (no `null`) cuando
    // el job no existe.
    const retryJobAfterSecondPush = await queue.getJob(retryJobId);
    expect(retryJobAfterSecondPush).toBeUndefined();

    await sleep(DEBOUNCE_MS + 3000); // más que suficiente para el nuevo canónico y para lo que hubiera sido el retry

    const leadTurns = turns.filter((t) => t.leadId === leadId);
    expect(leadTurns).toHaveLength(1);
    expect(leadTurns[0].entries.map((e) => e.body)).toEqual([
      'primero',
      'segundo',
    ]);
  }, 15000);
});
