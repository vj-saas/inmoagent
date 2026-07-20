import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../common/redis.module';
import { PrismaService } from '../prisma/prisma.service';

export type HealthStatus = 'ok' | 'error';

export interface HealthReport {
  db: HealthStatus;
  redis: HealthStatus;
}

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async check(): Promise<HealthReport> {
    const [dbOk, redisOk] = await Promise.all([
      this.prisma.isHealthy(),
      this.pingRedis(),
    ]);
    return {
      db: dbOk ? 'ok' : 'error',
      redis: redisOk ? 'ok' : 'error',
    };
  }

  private async pingRedis(): Promise<boolean> {
    try {
      const reply = await this.redis.ping();
      return reply === 'PONG';
    } catch {
      return false;
    }
  }
}
