import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { JobsOptions, Queue } from 'bullmq';
import type { Tenant } from '@prisma/client';
import { QUEUE_OUTBOUND } from '../queues/queues.constants';
import type { OutboundJobData } from './messaging.types';

const RETRY_JOB_OPTIONS: JobsOptions = {
  attempts: 5,
  backoff: { type: 'exponential', delay: 2000 },
  removeOnComplete: true,
  removeOnFail: 100,
};

/**
 * API pública para enviar mensajes salientes. No llama a Meta directamente:
 * encola el job en `outbound`, que `OutboundProcessor` consume con reintentos
 * y backoff, y recién ahí persiste el `Message` OUT.
 */
@Injectable()
export class MessagingService {
  constructor(
    @InjectQueue(QUEUE_OUTBOUND)
    private readonly outboundQueue: Queue<OutboundJobData>,
  ) {}

  async sendText(tenant: Tenant, to: string, body: string): Promise<void> {
    await this.outboundQueue.add(
      'send',
      { kind: 'text', tenantId: tenant.id, to, body },
      RETRY_JOB_OPTIONS,
    );
  }

  async sendImage(
    tenant: Tenant,
    to: string,
    imageUrl: string,
    caption?: string,
  ): Promise<void> {
    await this.outboundQueue.add(
      'send',
      { kind: 'image', tenantId: tenant.id, to, imageUrl, caption },
      RETRY_JOB_OPTIONS,
    );
  }

  async markAsRead(tenant: Tenant, waMessageId: string): Promise<void> {
    await this.outboundQueue.add(
      'send',
      { kind: 'read', tenantId: tenant.id, waMessageId },
      RETRY_JOB_OPTIONS,
    );
  }

  /** Mensaje business-initiated con un template pre-aprobado (notificaciones internas al tenant). */
  async sendTemplate(
    tenant: Tenant,
    to: string,
    templateName: string,
    bodyParams: string[],
    languageCode = 'es_AR',
  ): Promise<void> {
    await this.outboundQueue.add(
      'send',
      {
        kind: 'template',
        tenantId: tenant.id,
        to,
        templateName,
        languageCode,
        bodyParams,
      },
      RETRY_JOB_OPTIONS,
    );
  }
}
