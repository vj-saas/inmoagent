import { ConfigService } from '@nestjs/config';
import type { Queue } from 'bullmq';
import type Redis from 'ioredis';
import type { EnvConfig } from '../config/env.schema';
import { DebounceBufferService } from './debounce-buffer.service';
import type { DebounceEntry } from './pipeline.types';

const TENANT_ID = 'tenant-1';
const LEAD_ID = 'lead-1';
const CANONICAL_JOB_ID = `turn__${TENANT_ID}__${LEAD_ID}`;
const RETRY_JOB_ID = `${CANONICAL_JOB_ID}__retry`;

function entry(overrides: Partial<DebounceEntry> = {}): DebounceEntry {
  return {
    messageId: 'msg-1',
    body: 'hola',
    type: 'TEXT',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * `statefulLock: true` hace que `set`/`del` respeten de verdad la semántica
 * `SET NX` sobre un store en memoria, para poder ejercitar concurrencia real
 * sobre la misma key. Por default se mantiene el mock plano que usan los tests
 * de `push`/`tryFlush`/`purgeLead` ya existentes.
 */
function build({ statefulLock = false }: { statefulLock?: boolean } = {}) {
  const jobs = new Map<string, { remove: jest.Mock }>();
  const store = new Set<string>();

  const redis = {
    rpush: jest.fn().mockResolvedValue(1),
    lrange: jest.fn().mockResolvedValue([]),
    del: statefulLock
      ? jest.fn((key: string) => Promise.resolve(store.delete(key) ? 1 : 0))
      : jest.fn().mockResolvedValue(1),
    set: statefulLock
      ? jest.fn((key: string) => {
          if (store.has(key)) {
            return Promise.resolve(null);
          }
          store.add(key);
          return Promise.resolve('OK');
        })
      : jest.fn().mockResolvedValue('OK'),
  } as unknown as Redis;

  const queue = {
    getJob: jest.fn(async (jobId: string) => jobs.get(jobId) ?? null),
    add: jest.fn(
      async (_name: string, _data: unknown, opts: { jobId: string }) => {
        const job = { remove: jest.fn().mockResolvedValue(undefined) };
        jobs.set(opts.jobId, job);
        return job;
      },
    ),
  } as unknown as Queue;

  const config = {
    get: jest.fn().mockReturnValue(6),
  } as unknown as ConfigService<EnvConfig, true>;

  const service = new DebounceBufferService(redis, queue, config);
  return { service, redis, queue, jobs };
}

/** Key con la que se intentó tomar el lock en la primera llamada a `set`. */
function firstSetKey(redis: Redis): string {
  const calls = (redis.set as jest.Mock).mock.calls as unknown as string[][];
  return calls[0][0];
}

describe('DebounceBufferService', () => {
  it('push agenda el turno con jobId canónico fijo', async () => {
    const { service, queue } = build();

    await service.push(TENANT_ID, LEAD_ID, entry());

    expect(queue.add).toHaveBeenCalledWith(
      'process-turn',
      { tenantId: TENANT_ID, leadId: LEAD_ID },
      { delay: 6000, jobId: CANONICAL_JOB_ID },
    );
  });

  it('push cancela un retry huérfano pendiente para no dejarlo flotando', async () => {
    const { service, queue, jobs } = build();

    // Simula un retry agendado por un flush anterior que chocó con el lock.
    await service.push(TENANT_ID, LEAD_ID, entry());
    (queue.add as jest.Mock).mockClear();
    const retryJob = { remove: jest.fn().mockResolvedValue(undefined) };
    jobs.set(RETRY_JOB_ID, retryJob);

    await service.push(TENANT_ID, LEAD_ID, entry());

    expect(retryJob.remove).toHaveBeenCalled();
  });

  it('reintenta con un jobId fijo (no random) cuando el lock está ocupado', async () => {
    const { service, redis, queue } = build();
    (redis.set as jest.Mock).mockResolvedValueOnce(null); // lock ocupado

    await service.tryFlush(TENANT_ID, LEAD_ID, jest.fn());

    expect(queue.add).toHaveBeenCalledWith(
      'process-turn',
      { tenantId: TENANT_ID, leadId: LEAD_ID },
      { delay: 2000, jobId: RETRY_JOB_ID },
    );
  });

  it('dos locks ocupados seguidos no acumulan retries duplicados', async () => {
    const { service, redis, queue, jobs } = build();
    (redis.set as jest.Mock).mockResolvedValue(null);

    await service.tryFlush(TENANT_ID, LEAD_ID, jest.fn());
    const firstRetryJob = jobs.get(RETRY_JOB_ID);
    await service.tryFlush(TENANT_ID, LEAD_ID, jest.fn());

    expect(firstRetryJob?.remove).toHaveBeenCalled();
    expect(queue.add).toHaveBeenCalledTimes(2);
  });

  it('al flushear con éxito cancela cualquier retry pendiente de un lock previo', async () => {
    const { service, redis, jobs } = build();
    const retryJob = { remove: jest.fn().mockResolvedValue(undefined) };
    jobs.set(RETRY_JOB_ID, retryJob);
    (redis.set as jest.Mock).mockResolvedValueOnce('OK');
    (redis.lrange as jest.Mock).mockResolvedValueOnce([]);

    await service.tryFlush(TENANT_ID, LEAD_ID, jest.fn());

    expect(retryJob.remove).toHaveBeenCalled();
  });

  it('procesa igual (no descarta) entradas viejas, pero loguea el incidente', async () => {
    const { service, redis } = build();
    const staleEntry = entry({
      createdAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    });
    (redis.lrange as jest.Mock).mockResolvedValueOnce([
      JSON.stringify(staleEntry),
    ]);
    const errorSpy = jest
      .spyOn(
        (service as unknown as { logger: { error: (...a: unknown[]) => void } })
          .logger,
        'error',
      )
      .mockImplementation(() => undefined);
    const handler = jest.fn().mockResolvedValue(undefined);

    await service.tryFlush(TENANT_ID, LEAD_ID, handler);

    expect(handler).toHaveBeenCalledWith([staleEntry]);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: TENANT_ID, leadId: LEAD_ID }),
      expect.stringContaining('mucho más viejas'),
    );
  });

  it('no loguea nada si las entradas están dentro del rango normal de debounce', async () => {
    const { service, redis } = build();
    (redis.lrange as jest.Mock).mockResolvedValueOnce([
      JSON.stringify(entry()),
    ]);
    const errorSpy = jest
      .spyOn(
        (service as unknown as { logger: { error: (...a: unknown[]) => void } })
          .logger,
        'error',
      )
      .mockImplementation(() => undefined);
    const handler = jest.fn().mockResolvedValue(undefined);

    await service.tryFlush(TENANT_ID, LEAD_ID, handler);

    expect(handler).toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('purgeLead borra buffer, lock, job canónico y retry pendiente', async () => {
    const { service, redis, jobs } = build();
    const canonicalJob = { remove: jest.fn().mockResolvedValue(undefined) };
    const retryJob = { remove: jest.fn().mockResolvedValue(undefined) };
    jobs.set(CANONICAL_JOB_ID, canonicalJob);
    jobs.set(RETRY_JOB_ID, retryJob);

    await service.purgeLead(TENANT_ID, LEAD_ID);

    expect(redis.del).toHaveBeenCalledWith(`debounce:${TENANT_ID}:${LEAD_ID}`);
    expect(redis.del).toHaveBeenCalledWith(
      `debounce:lock:${TENANT_ID}:${LEAD_ID}`,
    );
    expect(canonicalJob.remove).toHaveBeenCalled();
    expect(retryJob.remove).toHaveBeenCalled();
  });

  describe('withLeadLock (exclusión mutua bot-humano, AC-7)', () => {
    it('toma exactamente la misma key de lock que tryFlush', async () => {
      const { service, redis } = build();

      await service.tryFlush(TENANT_ID, LEAD_ID, jest.fn());
      const flushKey = firstSetKey(redis);
      (redis.set as jest.Mock).mockClear();
      (redis.del as jest.Mock).mockClear();

      await service.withLeadLock(TENANT_ID, LEAD_ID, jest.fn());
      const lockKey = firstSetKey(redis);

      expect(lockKey).toBe(flushKey);
      expect(lockKey).toBe(`debounce:lock:${TENANT_ID}:${LEAD_ID}`);
      expect(redis.set).toHaveBeenCalledWith(lockKey, '1', 'PX', 60000, 'NX');
      // Y lo libera sobre esa misma key.
      expect(redis.del).toHaveBeenCalledWith(lockKey);
    });

    it('devuelve el resultado de fn cuando pudo tomar el lock', async () => {
      const { service } = build({ statefulLock: true });

      const result = await service.withLeadLock(TENANT_ID, LEAD_ID, () =>
        Promise.resolve({ ok: true }),
      );

      expect(result).toEqual({ ok: true });
    });

    it('devuelve null y NO ejecuta fn si el lock ya está tomado', async () => {
      const { service, redis } = build();
      (redis.set as jest.Mock).mockResolvedValueOnce(null); // lock ocupado
      const fn = jest.fn().mockResolvedValue('nunca');

      const result = await service.withLeadLock(TENANT_ID, LEAD_ID, fn);

      expect(result).toBeNull();
      expect(fn).not.toHaveBeenCalled();
      // No libera un lock que nunca tomó (sería robarle el lock al bot).
      expect(redis.del).not.toHaveBeenCalledWith(
        `debounce:lock:${TENANT_ID}:${LEAD_ID}`,
      );
    });

    it('libera el lock igual si fn lanza, y propaga la excepción', async () => {
      const { service, redis } = build();
      const boom = new Error('falló el envío manual');

      await expect(
        service.withLeadLock(TENANT_ID, LEAD_ID, () => Promise.reject(boom)),
      ).rejects.toBe(boom);

      expect(redis.del).toHaveBeenCalledWith(
        `debounce:lock:${TENANT_ID}:${LEAD_ID}`,
      );
    });

    it('tras una excepción de fn el lock queda libre para el siguiente actor', async () => {
      const { service } = build({ statefulLock: true });

      await expect(
        service.withLeadLock(TENANT_ID, LEAD_ID, () =>
          Promise.reject(new Error('boom')),
        ),
      ).rejects.toThrow('boom');

      const second = await service.withLeadLock(TENANT_ID, LEAD_ID, () =>
        Promise.resolve('entró'),
      );
      expect(second).toBe('entró');
    });

    it('dos llamadas concurrentes: solo UNA ejecuta fn, la otra recibe null', async () => {
      const { service } = build({ statefulLock: true });
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const fn = jest.fn(async () => {
        await gate;
        return 'ejecutado';
      });

      const first = service.withLeadLock(TENANT_ID, LEAD_ID, fn);
      const second = service.withLeadLock(TENANT_ID, LEAD_ID, fn);
      release();
      const results = await Promise.all([first, second]);

      expect(fn).toHaveBeenCalledTimes(1);
      expect(results.filter((r) => r === 'ejecutado')).toHaveLength(1);
      expect(results.filter((r) => r === null)).toHaveLength(1);
    });

    it('un turno del bot en vuelo (tryFlush con el lock) bloquea el send humano', async () => {
      const { service, redis } = build({ statefulLock: true });
      (redis.lrange as jest.Mock).mockResolvedValue([JSON.stringify(entry())]);
      let sendResult: unknown = 'sin-correr';

      await service.tryFlush(TENANT_ID, LEAD_ID, async () => {
        // Dentro del turno del bot, con el lock sostenido.
        sendResult = await service.withLeadLock(
          TENANT_ID,
          LEAD_ID,
          jest.fn().mockResolvedValue('enviado'),
        );
      });

      expect(sendResult).toBeNull();
      // Terminado el turno, el lock quedó libre.
      const after = await service.withLeadLock(TENANT_ID, LEAD_ID, () =>
        Promise.resolve('enviado'),
      );
      expect(after).toBe('enviado');
    });
  });
});
