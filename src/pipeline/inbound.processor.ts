import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { MessageType } from '@prisma/client';
import type { Job } from 'bullmq';
import { ConversationEngine } from '../conversation/conversation.engine';
import { MessagingService } from '../messaging/messaging.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  JOB_PROCESS_MESSAGE,
  JOB_PROCESS_TURN,
  QUEUE_INBOUND,
} from '../queues/queues.constants';
import type { MessageQueueJob } from '../queues/queues.types';
import { TenantsService } from '../tenants/tenants.service';
import { DebounceBufferService } from './debounce-buffer.service';
import { UNSUPPORTED_MESSAGE_RESPONSE } from './pipeline.constants';
import type { DebounceEntry, TurnJobData } from './pipeline.types';

type InboundJobName = typeof JOB_PROCESS_MESSAGE | typeof JOB_PROCESS_TURN;

@Processor(QUEUE_INBOUND)
export class InboundProcessor extends WorkerHost {
  private readonly logger = new Logger(InboundProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenants: TenantsService,
    private readonly messaging: MessagingService,
    private readonly debounceBuffer: DebounceBufferService,
    private readonly conversation: ConversationEngine,
  ) {
    super();
  }

  async process(
    job: Job<MessageQueueJob | TurnJobData, void, InboundJobName>,
  ): Promise<void> {
    if (job.name === JOB_PROCESS_TURN) {
      const { tenantId, leadId } = job.data;
      await this.debounceBuffer.tryFlush(tenantId, leadId, (entries) =>
        this.dispatchTurn(tenantId, leadId, entries),
      );
      return;
    }

    await this.handleMessage(job.data as MessageQueueJob);
  }

  private async handleMessage({
    tenantId,
    leadId,
    messageId,
  }: MessageQueueJob): Promise<void> {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
    });
    if (!message) {
      this.logger.warn(
        { messageId },
        'Message no encontrado, se ignora el job',
      );
      return;
    }

    if (message.type === MessageType.UNSUPPORTED) {
      await this.respondUnsupported(tenantId, leadId);
      return;
    }

    await this.debounceBuffer.push(tenantId, leadId, {
      messageId,
      body: message.body ?? '',
      type: message.type,
      createdAt: message.createdAt.toISOString(),
    });
  }

  private async respondUnsupported(
    tenantId: string,
    leadId: string,
  ): Promise<void> {
    const [tenant, lead] = await Promise.all([
      this.tenants.findById(tenantId),
      this.prisma.lead.findUnique({ where: { id: leadId } }),
    ]);
    if (!tenant || !lead) {
      this.logger.error(
        { tenantId, leadId },
        'Tenant o lead no encontrado para responder mensaje no soportado',
      );
      return;
    }
    await this.messaging.sendText(
      tenant,
      lead.phone,
      UNSUPPORTED_MESSAGE_RESPONSE,
    );
  }

  /** Arma el turno (mensajes concatenados en orden) y lo pasa al ConversationEngine (FSM + LLM). */
  private async dispatchTurn(
    tenantId: string,
    leadId: string,
    entries: DebounceEntry[],
  ): Promise<void> {
    const turnText = entries
      .map((entry) => entry.body)
      .join(' ')
      .trim();
    if (!turnText) {
      return;
    }
    await this.conversation.handleTurn(tenantId, leadId, turnText);
  }
}
