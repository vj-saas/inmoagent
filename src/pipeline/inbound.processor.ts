import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { ConversationState, MessageType } from '@prisma/client';
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

  /**
   * Estados en los que el bot NO puede escribirle al lead bajo ninguna
   * circunstancia (CLAUDE.md, reglas innegociables #6 y #7):
   * - `OPTED_OUT`: baja pedida por el lead, no se le vuelve a escribir.
   * - `HUMAN_HANDOFF`: bot silenciado hasta desbloqueo por admin o timeout.
   *
   * Es el mismo criterio que `GuardrailsService` aplica como `silenced` para
   * los turnos de texto, pero acá se chequea directo sobre `lead.state` en vez
   * de invocar `evaluate()`: ese método también decide `handoff_timeout_release`
   * (liberar un handoff vencido) y `opt_out`/`handoff` a partir del TEXTO del
   * turno, transiciones de FSM que sólo el `ConversationEngine` sabe persistir.
   * Un sticker no tiene texto y no debe liberar ni transicionar nada: acá sólo
   * se decide "responder o callarse".
   */
  private isSilenced(state: ConversationState): boolean {
    return (
      state === ConversationState.OPTED_OUT ||
      state === ConversationState.HUMAN_HANDOFF
    );
  }

  private async respondUnsupported(
    tenantId: string,
    leadId: string,
  ): Promise<void> {
    const [tenant, lead] = await Promise.all([
      this.tenants.findById(tenantId),
      this.prisma.lead.findFirst({ where: { id: leadId, tenantId } }),
    ]);
    if (!tenant || !lead) {
      this.logger.error(
        { tenantId, leadId },
        'Tenant o lead no encontrado para responder mensaje no soportado',
      );
      return;
    }
    if (this.isSilenced(lead.state)) {
      this.logger.debug(
        { tenantId, leadId, state: lead.state },
        'Mensaje no soportado de un lead silenciado: no se responde',
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
