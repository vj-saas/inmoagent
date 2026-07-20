import {
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
const LEAD = { id: 'lead-1', phone: '5491100000000' } as Lead;

function build(message: Partial<Message> | null) {
  const prisma = {
    message: { findUnique: jest.fn().mockResolvedValue(message) },
    lead: { findUnique: jest.fn().mockResolvedValue(LEAD) },
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
