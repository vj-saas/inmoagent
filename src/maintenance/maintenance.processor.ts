import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { QUEUE_MAINTENANCE } from '../queues/queues.constants';
import {
  JOB_PURGE_WEBHOOK_EVENTS,
  WEBHOOK_EVENT_RETENTION_DAYS,
} from './maintenance.constants';

@Processor(QUEUE_MAINTENANCE)
export class MaintenanceProcessor extends WorkerHost {
  private readonly logger = new Logger(MaintenanceProcessor.name);

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name !== JOB_PURGE_WEBHOOK_EVENTS) {
      return;
    }

    const cutoff = new Date(
      Date.now() - WEBHOOK_EVENT_RETENTION_DAYS * 24 * 60 * 60 * 1000,
    );
    const { count } = await this.prisma.webhookEvent.deleteMany({
      where: { receivedAt: { lt: cutoff } },
    });
    this.logger.log(
      { deleted: count, cutoff },
      'Purga diaria de WebhookEvent completada',
    );
  }
}
