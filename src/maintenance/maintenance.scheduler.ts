import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { QUEUE_MAINTENANCE } from '../queues/queues.constants';
import {
  JOB_PURGE_WEBHOOK_EVENTS,
  PURGE_CRON_PATTERN,
} from './maintenance.constants';

/**
 * Registra el job repeatable de purga al bootear la app. `queue.add` con el
 * mismo `repeat`+`jobId` es idempotente en BullMQ: reiniciar la app no
 * duplica el schedule.
 */
@Injectable()
export class MaintenanceScheduler implements OnModuleInit {
  private readonly logger = new Logger(MaintenanceScheduler.name);

  constructor(@InjectQueue(QUEUE_MAINTENANCE) private readonly queue: Queue) {}

  async onModuleInit(): Promise<void> {
    await this.queue.add(
      JOB_PURGE_WEBHOOK_EVENTS,
      {},
      {
        repeat: { pattern: PURGE_CRON_PATTERN },
        jobId: JOB_PURGE_WEBHOOK_EVENTS,
      },
    );
    this.logger.log(
      { pattern: PURGE_CRON_PATTERN },
      'Job repeatable de purga de WebhookEvent registrado',
    );
  }
}
