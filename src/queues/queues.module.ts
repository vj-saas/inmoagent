import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../common/redis.module';
import {
  QUEUE_INBOUND,
  QUEUE_MAINTENANCE,
  QUEUE_MEDIA,
  QUEUE_OUTBOUND,
} from './queues.constants';

@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [REDIS_CLIENT],
      useFactory: (connection: Redis) => ({ connection }),
    }),
    BullModule.registerQueue(
      { name: QUEUE_INBOUND },
      { name: QUEUE_MEDIA },
      { name: QUEUE_OUTBOUND },
      { name: QUEUE_MAINTENANCE },
    ),
  ],
  exports: [BullModule],
})
export class QueuesModule {}
