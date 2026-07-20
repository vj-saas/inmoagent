import type Redis from 'ioredis';
import { HealthService } from './health.service';
import { PrismaService } from '../prisma/prisma.service';

describe('HealthService', () => {
  function build(dbHealthy: boolean, redisPing: () => Promise<string>) {
    const prisma = {
      isHealthy: jest.fn().mockResolvedValue(dbHealthy),
    } as unknown as PrismaService;
    const redis = {
      ping: jest.fn().mockImplementation(redisPing),
    } as unknown as Redis;
    return new HealthService(prisma, redis);
  }

  it('reporta ok/ok cuando DB y Redis responden', async () => {
    const service = build(true, () => Promise.resolve('PONG'));

    await expect(service.check()).resolves.toEqual({ db: 'ok', redis: 'ok' });
  });

  it('reporta error en db cuando Prisma no puede conectar', async () => {
    const service = build(false, () => Promise.resolve('PONG'));

    await expect(service.check()).resolves.toEqual({
      db: 'error',
      redis: 'ok',
    });
  });

  it('reporta error en redis cuando el ping falla', async () => {
    const service = build(true, () =>
      Promise.reject(new Error('ECONNREFUSED')),
    );

    await expect(service.check()).resolves.toEqual({
      db: 'ok',
      redis: 'error',
    });
  });
});
