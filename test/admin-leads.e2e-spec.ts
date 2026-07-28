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
      priceFlexible: false,
      extraRequirements: null,
      interestedPropertyIndex: null,
      name: null,
      timeline: null,
      guarantee: null,
      paymentMethod: null,
      hasPropertyToSell: null,
      visitAvailability: null,
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

  describe('Búsqueda (q) y filtro multi-estado en GET /leads (AC-2, AC-4, AC-5)', () => {
    it('busca por phone que contiene el término (case-insensitive)', async () => {
      const needle = randomBytes(4).toString('hex');
      const lead = await createLead({ state: ConversationState.GREETING });
      await prisma.lead.update({
        where: { id: lead.id },
        data: { phone: `5491100${needle.toUpperCase()}` },
      });

      const res = await request(app.getHttpServer())
        .get(`/admin/tenants/${tenant.id}/leads`)
        .query({ q: needle })
        .set('X-Api-Key', apiKey)
        .expect(200);

      const body = res.body as { leads: Array<{ id: string }> };
      expect(body.leads.some((l) => l.id === lead.id)).toBe(true);
    });

    it('busca por name que contiene el término (case-insensitive)', async () => {
      const lead = await createLead({ state: ConversationState.GREETING });
      await prisma.lead.update({
        where: { id: lead.id },
        data: { name: 'Maria Fernanda Gomez' },
      });

      const res = await request(app.getHttpServer())
        .get(`/admin/tenants/${tenant.id}/leads`)
        .query({ q: 'fernanda' })
        .set('X-Api-Key', apiKey)
        .expect(200);

      const body = res.body as { leads: Array<{ id: string }> };
      expect(body.leads.some((l) => l.id === lead.id)).toBe(true);
    });

    it('combina state + q en una sola llamada (intersección calculada por el backend)', async () => {
      const needle = randomBytes(4).toString('hex');
      const matching = await createLead({
        state: ConversationState.QUALIFICATION,
      });
      await prisma.lead.update({
        where: { id: matching.id },
        data: { phone: `5491100${needle}` },
      });
      const wrongState = await createLead({ state: ConversationState.GREETING });
      await prisma.lead.update({
        where: { id: wrongState.id },
        data: { phone: `5491101${needle}` },
      });

      const res = await request(app.getHttpServer())
        .get(`/admin/tenants/${tenant.id}/leads`)
        .query(`q=${needle}&state=${ConversationState.QUALIFICATION}`)
        .set('X-Api-Key', apiKey)
        .expect(200);

      const body = res.body as { leads: Array<{ id: string }> };
      expect(body.leads.some((l) => l.id === matching.id)).toBe(true);
      expect(body.leads.some((l) => l.id === wrongState.id)).toBe(false);
    });

    it('filtra con dos estados a la vez (?state=A&state=B)', async () => {
      const leadGreeting = await createLead({
        state: ConversationState.GREETING,
      });
      const leadHandoff = await createLead({
        state: ConversationState.HUMAN_HANDOFF,
        handoffAt: new Date(),
      });
      const leadOptedOut = await createLead({
        state: ConversationState.OPTED_OUT,
      });

      const res = await request(app.getHttpServer())
        .get(`/admin/tenants/${tenant.id}/leads`)
        .query(
          `state=${ConversationState.GREETING}&state=${ConversationState.HUMAN_HANDOFF}`,
        )
        .set('X-Api-Key', apiKey)
        .expect(200);

      const body = res.body as { leads: Array<{ id: string }> };
      const ids = body.leads.map((l) => l.id);
      expect(ids).toContain(leadGreeting.id);
      expect(ids).toContain(leadHandoff.id);
      expect(ids).not.toContain(leadOptedOut.id);
    });
  });

  describe('Detalle de lead GET /leads/:leadId (AC-6, AC-7)', () => {
    it('200: devuelve todos los campos f* esperados y sin el array messages', async () => {
      const lead = await createLead({ state: ConversationState.QUALIFICATION });

      const res = await request(app.getHttpServer())
        .get(`/admin/tenants/${tenant.id}/leads/${lead.id}`)
        .set('X-Api-Key', apiKey)
        .expect(200);

      const body = res.body as Record<string, unknown>;
      expect(body).toEqual(
        expect.objectContaining({
          id: lead.id,
          tenantId: tenant.id,
          phone: lead.phone,
          state: ConversationState.QUALIFICATION,
          fOperation: null,
          fNeighborhoods: [],
          fMaxPrice: null,
          fCurrency: null,
          fMinRooms: null,
          fGarage: null,
          fPetsAllowed: null,
          fNotes: null,
          fPreferredDay: null,
          fOfferedNeighborhoods: [],
          fPriceMentionedAtTurn: null,
          lastSearchIds: [],
          turnCount: 0,
        }),
      );
      expect(body).not.toHaveProperty('messages');
    });

    it('404: leadId inexistente', async () => {
      await request(app.getHttpServer())
        .get(`/admin/tenants/${tenant.id}/leads/lead-inexistente`)
        .set('X-Api-Key', apiKey)
        .expect(404);
    });

    it('404: leadId que pertenece a otro tenant (mismo status/mensaje que inexistente)', async () => {
      const otherTenant = await prisma.tenant.create({
        data: {
          name: 'Otro Tenant Detalle',
          slug: `otro-tenant-detalle-${randomBytes(4).toString('hex')}`,
          phoneNumberId: `otro-tenant-detalle-phone-${randomBytes(4).toString('hex')}`,
          accessTokenEnc: 'irrelevante',
          apiKeyHash: await argon2.hash('irrelevante'),
        },
      });
      const foreignLead = await prisma.lead.create({
        data: {
          tenantId: otherTenant.id,
          phone: `5491100${randomBytes(4).toString('hex')}`,
        },
      });

      try {
        const resInexistente = await request(app.getHttpServer())
          .get(`/admin/tenants/${tenant.id}/leads/lead-inexistente`)
          .set('X-Api-Key', apiKey)
          .expect(404);
        const resForeign = await request(app.getHttpServer())
          .get(`/admin/tenants/${tenant.id}/leads/${foreignLead.id}`)
          .set('X-Api-Key', apiKey)
          .expect(404);

        expect(resForeign.body).toEqual(resInexistente.body);
      } finally {
        await prisma.tenant
          .delete({ where: { id: otherTenant.id } })
          .catch(() => undefined);
      }
    });
  });

  describe('Regresión AC-14: tenantId de otro tenant en la URL → 403 (ya garantizado por TenantScopeGuard de A.2)', () => {
    it('GET .../leads y GET .../leads/:leadId con X-Api-Key de otro tenant no filtran datos de este tenant (401, camino legado de API key)', async () => {
      const otherTenant = await prisma.tenant.create({
        data: {
          name: 'Otro Tenant Regresion',
          slug: `otro-tenant-regresion-${randomBytes(4).toString('hex')}`,
          phoneNumberId: `otro-tenant-regresion-phone-${randomBytes(4).toString('hex')}`,
          accessTokenEnc: 'irrelevante',
          apiKeyHash: await argon2.hash('irrelevante'),
        },
      });
      const lead = await createLead({ state: ConversationState.GREETING });

      try {
        // La API key de `tenant` no autoriza sobre la URL de `otherTenant`
        // (aislamiento de la rama de API key: la nota de T4 remite el 403 por
        // sesión al e2e del guard compuesto, donde ya vive esa cobertura de
        // AC-14/AC-19; acá se confirma que la rama de API key sigue rechazando).
        await request(app.getHttpServer())
          .get(`/admin/tenants/${otherTenant.id}/leads`)
          .set('X-Api-Key', apiKey)
          .expect(401);
        await request(app.getHttpServer())
          .get(`/admin/tenants/${otherTenant.id}/leads/${lead.id}`)
          .set('X-Api-Key', apiKey)
          .expect(401);
      } finally {
        await prisma.tenant
          .delete({ where: { id: otherTenant.id } })
          .catch(() => undefined);
      }
    });
  });
});
