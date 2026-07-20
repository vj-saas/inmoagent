import { randomBytes } from 'node:crypto';
import { getQueueToken } from '@nestjs/bullmq';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  ConversationState,
  MessageDirection,
  MessageType,
  type Tenant,
} from '@prisma/client';
import * as argon2 from 'argon2';
import type { Queue } from 'bullmq';
import type Redis from 'ioredis';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { REDIS_CLIENT } from '../src/common/redis.module';
import { ConversationEngine } from '../src/conversation/conversation.engine';
import {
  LLM_PROVIDER,
  type LlmProvider,
} from '../src/llm/llm-provider.interface';
import { MessagingService } from '../src/messaging/messaging.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { DebounceBufferService } from '../src/pipeline/debounce-buffer.service';
import { QUEUE_INBOUND } from '../src/queues/queues.constants';

describe('Admin: release y supresión de leads (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let redis: Redis;
  let inboundQueue: Queue;
  let debounceBuffer: DebounceBufferService;
  let engine: ConversationEngine;
  let llm: jest.Mocked<LlmProvider>;
  let messaging: jest.Mocked<
    Pick<
      MessagingService,
      'sendText' | 'sendImage' | 'sendTemplate' | 'markAsRead'
    >
  >;

  const suffix = randomBytes(4).toString('hex');
  const apiKey = `test-admin-api-key-${suffix}`;
  let tenant: Tenant;

  beforeAll(async () => {
    llm = { extractIntent: jest.fn(), composeReply: jest.fn() };
    messaging = {
      sendText: jest.fn().mockResolvedValue(undefined),
      sendImage: jest.fn().mockResolvedValue(undefined),
      sendTemplate: jest.fn().mockResolvedValue(undefined),
      markAsRead: jest.fn().mockResolvedValue(undefined),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(LLM_PROVIDER)
      .useValue(llm)
      .overrideProvider(MessagingService)
      .useValue(messaging)
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    prisma = app.get(PrismaService);
    redis = app.get(REDIS_CLIENT);
    inboundQueue = app.get(getQueueToken(QUEUE_INBOUND));
    debounceBuffer = app.get(DebounceBufferService);
    engine = app.get(ConversationEngine);

    tenant = await prisma.tenant.create({
      data: {
        name: 'Admin Test Tenant',
        slug: `admin-test-${suffix}`,
        phoneNumberId: `admin-test-phone-${suffix}`,
        accessTokenEnc: 'irrelevante',
        apiKeyHash: await argon2.hash(apiKey),
        alertsEnabled: true,
        alertPhone: '5491100009999',
      },
    });
  });

  afterAll(async () => {
    await prisma.tenant
      .delete({ where: { id: tenant.id } })
      .catch(() => undefined);
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  async function createLead(
    overrides: Partial<{
      state: ConversationState;
      handoffAt: Date | null;
    }> = {},
  ) {
    return prisma.lead.create({
      data: {
        tenantId: tenant.id,
        phone: `5491100${randomBytes(4).toString('hex')}`,
        ...overrides,
      },
    });
  }

  it('rechaza sin X-Api-Key', async () => {
    const lead = await createLead({
      state: ConversationState.HUMAN_HANDOFF,
      handoffAt: new Date(),
    });
    await request(app.getHttpServer())
      .post(`/admin/tenants/${tenant.id}/leads/${lead.id}/release`)
      .expect(401);
  });

  it('release: 404 si el lead no existe', async () => {
    await request(app.getHttpServer())
      .post(`/admin/tenants/${tenant.id}/leads/lead-inexistente/release`)
      .set('X-Api-Key', apiKey)
      .expect(404);
  });

  it('release: 400 si el lead no está en HUMAN_HANDOFF', async () => {
    const lead = await createLead({ state: ConversationState.QUALIFICATION });
    await request(app.getHttpServer())
      .post(`/admin/tenants/${tenant.id}/leads/${lead.id}/release`)
      .set('X-Api-Key', apiKey)
      .expect(400);
  });

  it('release: pasa a QUALIFICATION y el lead vuelve a recibir respuestas del bot', async () => {
    const lead = await createLead({
      state: ConversationState.HUMAN_HANDOFF,
      handoffAt: new Date(),
    });

    await request(app.getHttpServer())
      .post(`/admin/tenants/${tenant.id}/leads/${lead.id}/release`)
      .set('X-Api-Key', apiKey)
      .expect(200, { released: true });

    const releasedLead = await prisma.lead.findUniqueOrThrow({
      where: { id: lead.id },
    });
    expect(releasedLead.state).toBe(ConversationState.QUALIFICATION);
    expect(releasedLead.handoffAt).toBeNull();

    llm.extractIntent.mockResolvedValue({
      intent: 'provide_info',
      operation: null,
      neighborhoods: [],
      maxPrice: null,
      currency: null,
      minRooms: null,
      wantsGarage: null,
      wantsPetsAllowed: null,
      roomsInferred: false,
      extraRequirements: null,
      interestedPropertyIndex: null,
    });
    llm.composeReply.mockResolvedValue('¿En qué barrio te gustaría buscar?');
    await engine.handleTurn(tenant.id, lead.id, 'hola, siguen ahí?');
    expect(messaging.sendText).toHaveBeenCalled(); // ya no está silenciado
  });

  it('supresión: borra el lead, sus mensajes, y el buffer/job de debounce en Redis', async () => {
    const lead = await createLead({ state: ConversationState.QUALIFICATION });
    await prisma.message.create({
      data: {
        tenantId: tenant.id,
        leadId: lead.id,
        direction: MessageDirection.IN,
        type: MessageType.TEXT,
        body: 'hola',
      },
    });
    await debounceBuffer.push(tenant.id, lead.id, {
      messageId: 'm1',
      body: 'hola de nuevo',
      type: 'TEXT',
      createdAt: new Date().toISOString(),
    });

    const bufferKey = `debounce:${tenant.id}:${lead.id}`;
    const jobId = `turn__${tenant.id}__${lead.id}`;
    expect(await redis.llen(bufferKey)).toBeGreaterThan(0);
    expect(await inboundQueue.getJob(jobId)).toBeTruthy();

    await request(app.getHttpServer())
      .delete(`/admin/tenants/${tenant.id}/leads/${lead.id}`)
      .set('X-Api-Key', apiKey)
      .expect(200, { deleted: true });

    expect(await prisma.lead.findUnique({ where: { id: lead.id } })).toBeNull();
    expect(
      await prisma.message.findMany({ where: { leadId: lead.id } }),
    ).toEqual([]);
    expect(await redis.llen(bufferKey)).toBe(0);
    expect(await inboundQueue.getJob(jobId)).toBeFalsy();
  });

  it('supresión: 404 si el lead no existe (o ya de otro tenant)', async () => {
    await request(app.getHttpServer())
      .delete(`/admin/tenants/${tenant.id}/leads/lead-inexistente`)
      .set('X-Api-Key', apiKey)
      .expect(404);
  });
});
