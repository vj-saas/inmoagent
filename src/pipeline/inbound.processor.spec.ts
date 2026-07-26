import {
  ConversationState,
  MessageType,
  type Lead,
  type Message,
  type Tenant,
} from '@prisma/client';
import type { Job } from 'bullmq';
import type { MessagingService } from '../messaging/messaging.service';
import type { PrismaService } from '../prisma/prisma.service';
import {
  JOB_PROCESS_MESSAGE,
  JOB_PROCESS_TURN,
} from '../queues/queues.constants';
import type { MessageQueueJob } from '../queues/queues.types';
import type { TenantsService } from '../tenants/tenants.service';
import { DebounceBufferService } from './debounce-buffer.service';
import { InboundProcessor } from './inbound.processor';
import { UNSUPPORTED_MESSAGE_RESPONSE } from './pipeline.constants';
import type { TurnJobData } from './pipeline.types';

const TENANT = { id: 'tenant-1' } as Tenant;
const LEAD = {
  id: 'lead-1',
  phone: '5491100000000',
  state: ConversationState.QUALIFICATION,
} as Lead;

function build(message: Partial<Message> | null, lead: Lead = LEAD) {
  const prisma = {
    message: { findUnique: jest.fn().mockResolvedValue(message) },
    lead: { findUnique: jest.fn().mockResolvedValue(lead) },
  } as unknown as PrismaService;
  const tenants = {
    findById: jest.fn().mockResolvedValue(TENANT),
  } as unknown as TenantsService;
  const messaging = {
    sendText: jest.fn().mockResolvedValue(undefined),
  } as unknown as MessagingService;
  const debounceBuffer = {
    push: jest.fn().mockResolvedValue(undefined),
    tryFlush: jest.fn().mockResolvedValue(undefined),
  } as unknown as DebounceBufferService;
  const conversation = {
    handleTurn: jest.fn().mockResolvedValue(undefined),
  } as unknown as import('../conversation/conversation.engine').ConversationEngine;

  const processor = new InboundProcessor(
    prisma,
    tenants,
    messaging,
    debounceBuffer,
    conversation,
  );
  return {
    processor,
    prisma,
    tenants,
    messaging,
    debounceBuffer,
    conversation,
  };
}

function messageJob(): Job<MessageQueueJob, void, typeof JOB_PROCESS_MESSAGE> {
  return {
    name: JOB_PROCESS_MESSAGE,
    data: { tenantId: 'tenant-1', leadId: 'lead-1', messageId: 'message-1' },
  } as Job<MessageQueueJob, void, typeof JOB_PROCESS_MESSAGE>;
}

function turnJob(): Job<TurnJobData, void, typeof JOB_PROCESS_TURN> {
  return {
    name: JOB_PROCESS_TURN,
    data: { tenantId: 'tenant-1', leadId: 'lead-1' },
  } as Job<TurnJobData, void, typeof JOB_PROCESS_TURN>;
}

describe('InboundProcessor', () => {
  it('mensajes de texto se empujan al DebounceBuffer', async () => {
    const { processor, debounceBuffer, messaging } = build({
      id: 'message-1',
      type: MessageType.TEXT,
      body: 'hola',
      createdAt: new Date(),
    });

    await processor.process(messageJob());

    expect(debounceBuffer.push).toHaveBeenCalledWith(
      'tenant-1',
      'lead-1',
      expect.objectContaining({ body: 'hola', type: MessageType.TEXT }),
    );
    expect(messaging.sendText).not.toHaveBeenCalled();
  });

  it('mensajes UNSUPPORTED responden la respuesta fija de inmediato, sin pasar por el debounce', async () => {
    const { processor, debounceBuffer, messaging } = build({
      id: 'message-1',
      type: MessageType.UNSUPPORTED,
      body: null,
      createdAt: new Date(),
    });

    await processor.process(messageJob());

    expect(messaging.sendText).toHaveBeenCalledWith(
      TENANT,
      LEAD.phone,
      UNSUPPORTED_MESSAGE_RESPONSE,
    );
    expect(debounceBuffer.push).not.toHaveBeenCalled();
  });

  it('job process-turn delega en debounceBuffer.tryFlush', async () => {
    const { processor, debounceBuffer } = build(null);

    await processor.process(turnJob());

    expect(debounceBuffer.tryFlush).toHaveBeenCalledWith(
      'tenant-1',
      'lead-1',
      expect.any(Function),
    );
  });

  it('ignora silenciosamente un messageId que ya no existe', async () => {
    const { processor, debounceBuffer, messaging } = build(null);

    await processor.process(messageJob());

    expect(debounceBuffer.push).not.toHaveBeenCalled();
    expect(messaging.sendText).not.toHaveBeenCalled();
  });
});

/**
 * [CRÍTICO] La respuesta automática a mensajes no soportados es una escritura
 * del bot al lead y por lo tanto está sujeta a las reglas innegociables #6
 * (`OPTED_OUT`: no se le vuelve a escribir) y #7 (`HUMAN_HANDOFF`: bot
 * silenciado). Antes de este fix un sticker de un lead dado de baja disparaba
 * igual `UNSUPPORTED_MESSAGE_RESPONSE`, salteándose ambos guardrails porque
 * este camino no pasa por el debounce ni por `GuardrailsService`.
 */
describe('InboundProcessor — UNSUPPORTED en estados silenciados', () => {
  function unsupportedMessage(): Partial<Message> {
    return {
      id: 'message-1',
      type: MessageType.UNSUPPORTED,
      body: null,
      createdAt: new Date(),
    };
  }

  function leadIn(
    state: ConversationState,
    handoffAt: Date | null = null,
  ): Lead {
    return { ...LEAD, state, handoffAt };
  }

  it('[CRÍTICO] lead OPTED_OUT: no se le responde nada (regla #6)', async () => {
    const { processor, messaging, debounceBuffer } = build(
      unsupportedMessage(),
      leadIn(ConversationState.OPTED_OUT),
    );

    await processor.process(messageJob());

    expect(messaging.sendText).not.toHaveBeenCalled();
    expect(debounceBuffer.push).not.toHaveBeenCalled();
  });

  it('[CRÍTICO] lead HUMAN_HANDOFF: el bot está silenciado, no responde (regla #7)', async () => {
    const { processor, messaging, debounceBuffer } = build(
      unsupportedMessage(),
      leadIn(ConversationState.HUMAN_HANDOFF, new Date()),
    );

    await processor.process(messageJob());

    expect(messaging.sendText).not.toHaveBeenCalled();
    expect(debounceBuffer.push).not.toHaveBeenCalled();
  });

  /**
   * Un handoff vencido (>48hs) lo libera `ConversationEngine` a partir de un
   * turno de TEXTO (guardrail `handoff_timeout_release`). Un sticker no tiene
   * texto ni transiciona la FSM, así que acá sigue silenciado: responderle
   * sería escribirle a un lead cuyo estado en DB sigue siendo HUMAN_HANDOFF.
   */
  it('[CRÍTICO] lead HUMAN_HANDOFF vencido (>48hs): tampoco responde, el release lo hace la FSM con texto', async () => {
    const { processor, messaging } = build(
      unsupportedMessage(),
      leadIn(
        ConversationState.HUMAN_HANDOFF,
        new Date(Date.now() - 72 * 60 * 60 * 1000),
      ),
    );

    await processor.process(messageJob());

    expect(messaging.sendText).not.toHaveBeenCalled();
  });

  it.each([
    ConversationState.GREETING,
    ConversationState.QUALIFICATION,
    ConversationState.SEARCH_MATCH,
    ConversationState.SCHEDULING,
  ])('estado %s: responde igual que antes', async (state) => {
    const { processor, messaging } = build(unsupportedMessage(), leadIn(state));

    await processor.process(messageJob());

    expect(messaging.sendText).toHaveBeenCalledWith(
      TENANT,
      LEAD.phone,
      UNSUPPORTED_MESSAGE_RESPONSE,
    );
  });
});
