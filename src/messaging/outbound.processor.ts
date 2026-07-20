import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { MessageDirection, MessageType, type Tenant } from '@prisma/client';
import type { Job } from 'bullmq';
import { LeadsService } from '../leads/leads.service';
import { PrismaService } from '../prisma/prisma.service';
import { QUEUE_OUTBOUND } from '../queues/queues.constants';
import { TenantsService } from '../tenants/tenants.service';
import { MetaGraphClient, type MetaSendResult } from './meta-graph.client';
import type { OutboundJobData } from './messaging.types';

@Processor(QUEUE_OUTBOUND)
export class OutboundProcessor extends WorkerHost {
  private readonly logger = new Logger(OutboundProcessor.name);

  constructor(
    private readonly tenants: TenantsService,
    private readonly leads: LeadsService,
    private readonly prisma: PrismaService,
    private readonly graphClient: MetaGraphClient,
  ) {
    super();
  }

  async process(job: Job<OutboundJobData>): Promise<void> {
    const tenant = await this.tenants.findById(job.data.tenantId);
    if (!tenant) {
      // No reintentar: si el tenant no existe, nunca va a aparecer.
      this.logger.error(
        { tenantId: job.data.tenantId },
        'Tenant no encontrado para job outbound, se descarta',
      );
      return;
    }
    const accessToken = this.tenants.getDecryptedAccessToken(tenant);
    const data = job.data;

    switch (data.kind) {
      case 'text':
        await this.sendAndPersist(
          tenant,
          data.to,
          MessageType.TEXT,
          data.body,
          () =>
            this.graphClient.sendText(
              tenant.phoneNumberId,
              accessToken,
              data.to,
              data.body,
            ),
        );
        return;
      case 'image':
        await this.sendAndPersist(
          tenant,
          data.to,
          MessageType.IMAGE,
          data.caption ?? null,
          () =>
            this.graphClient.sendImage(
              tenant.phoneNumberId,
              accessToken,
              data.to,
              data.imageUrl,
              data.caption,
            ),
        );
        return;
      case 'read':
        await this.graphClient.markAsRead(
          tenant.phoneNumberId,
          accessToken,
          data.waMessageId,
        );
        return;
      case 'template':
        // Notificación interna al tenant: no es parte de la conversación con un lead, no se persiste como Message.
        await this.graphClient.sendTemplate(
          tenant.phoneNumberId,
          accessToken,
          data.to,
          data.templateName,
          data.languageCode,
          data.bodyParams,
        );
        return;
    }
  }

  private async sendAndPersist(
    tenant: Tenant,
    to: string,
    type: MessageType,
    body: string | null,
    send: () => Promise<MetaSendResult>,
  ): Promise<void> {
    const result = await send();
    const lead = await this.leads.findOrCreateByPhone(tenant.id, to);
    await this.prisma.message.create({
      data: {
        tenantId: tenant.id,
        leadId: lead.id,
        direction: MessageDirection.OUT,
        type,
        waMessageId: result.waMessageId || null,
        body,
      },
    });
  }
}
