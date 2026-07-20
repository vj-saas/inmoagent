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

function build() {
  const jobs = new Map<string, { remove: jest.Mock }>();

  const redis = {
    rpush: jest.fn().mockResolvedValue(1),
    lrange: jest.fn().mockResolvedValue([]),
    del: jest.fn().mockResolvedValue(1),
    set: jest.fn().mockResolvedValue('OK'),
  } as unknown as Redis;

  const queue = {
    getJob: jest.fn(async (jobId: string) => jobs.get(jobId) ?? null),
    add: jest.fn(async (_name: string, _data: unknown, opts: { jobId: string }) => {
      const job = { remove: jest.fn().mockResolvedValue(undefined) };
      jobs.set(opts.jobId, job);
      return job;
    }),
  } as unknown as Queue;

  const config = {
    get: jest.fn().mockReturnValue(6),
  } as unknown as ConfigService<EnvConfig, true>;

  const service = new DebounceBufferService(redis, queue, config);
  return { service, redis, queue, jobs };
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
      .spyOn((service as unknown as { logger: { error: (...a: unknown[]) => void } }).logger, 'error')
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
    (redis.lrange as jest.Mock).mockResolvedValueOnce([JSON.stringify(entry())]);
    const errorSpy = jest
      .spyOn((service as unknown as { logger: { error: (...a: unknown[]) => void } }).logger, 'error')
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
});
