import { randomBytes } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  ConversationState,
  MessageDirection,
  MessageType,
  PersonRole,
  type Person,
  type Tenant,
} from '@prisma/client';
import * as argon2 from 'argon2';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { MessagingService } from '../src/messaging/messaging.service';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  LLM_PROVIDER,
  type LlmProvider,
} from '../src/llm/llm-provider.interface';

/**
 * E2E básico de T9 (`POST :leadId/send`), cableando T4/T7/T8 a HTTP: happy
 * path, guards (AC-5), validación (AC-4), 404 cross-tenant (AC-13) y la
 * exposición de `lastInboundAt`/`sentByPerson` en `getOne`/`messages`
 * (AC-14). El flujo completo de los cinco AC críticos es T20 (fuera de
 * alcance acá).
 */
describe('Admin: envío manual (POST :leadId/send) (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let sendText: jest.Mock;

  const suffix = randomBytes(4).toString('hex');
  const apiKey = `test-send-api-key-${suffix}`;
  const password = 'password123';
  let tenant: Tenant;
  let person: Person;
  let token: string;

  beforeAll(async () => {
    const llm: jest.Mocked<LlmProvider> = {
      extractIntent: jest.fn(),
      composeReply: jest.fn(),
    };
    sendText = jest.fn().mockResolvedValue(undefined);
    const messaging = {
      sendText,
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

    tenant = await prisma.tenant.create({
      data: {
        name: 'Manual Reply Test Tenant',
        slug: `manual-reply-${suffix}`,
        phoneNumberId: `manual-reply-phone-${suffix}`,
        accessTokenEnc: 'irrelevante',
        apiKeyHash: await argon2.hash(apiKey),
      },
    });

    person = await prisma.person.create({
      data: {
        tenantId: tenant.id,
        email: `agente-send-${suffix}@test.com`,
        passwordHash: await argon2.hash(password),
        role: PersonRole.AGENT,
      },
    });

    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: person.email, password })
      .expect(200);
    token = (loginRes.body as { token: string }).token;
  });

  afterAll(async () => {
    await prisma.tenant
      .delete({ where: { id: tenant.id } })
      .catch(() => undefined);
    await app.close();
  });

  beforeEach(() => {
    sendText.mockClear();
  });

  async function createLead(
    overrides: Partial<{ state: ConversationState }> = {},
  ) {
    return prisma.lead.create({
      data: {
        tenantId: tenant.id,
        phone: `5491100${randomBytes(4).toString('hex')}`,
        ...overrides,
      },
    });
  }

  async function createInboundMessage(leadId: string, createdAt: Date) {
    return prisma.message.create({
      data: {
        tenantId: tenant.id,
        leadId,
        direction: MessageDirection.IN,
        type: MessageType.TEXT,
        body: 'hola',
        createdAt,
      },
    });
  }

  const sendUrl = (leadId: string) =>
    `/admin/tenants/${tenant.id}/leads/${leadId}/send`;

  it('AC-1/AC-4/AC-5: sesión de persona válida con un IN reciente → 200, HUMAN_HANDOFF y un Message OUT', async () => {
    const lead = await createLead();
    await createInboundMessage(lead.id, new Date());

    const res = await request(app.getHttpServer())
      .post(sendUrl(lead.id))
      .set('Authorization', `Bearer ${token}`)
      .send({ text: 'Hola, te escribo por tu consulta' })
      .expect(201);

    const body = res.body as {
      message: { id: string; sentByPersonId: string; body: string };
      lead: { state: string };
    };
    expect(body.message.sentByPersonId).toBe(person.id);
    expect(body.message.body).toBe('Hola, te escribo por tu consulta');
    expect(body.lead.state).toBe(ConversationState.HUMAN_HANDOFF);

    const dbLead = await prisma.lead.findUniqueOrThrow({
      where: { id: lead.id },
    });
    expect(dbLead.state).toBe(ConversationState.HUMAN_HANDOFF);
    expect(dbLead.handoffAt).not.toBeNull();

    const messages = await prisma.message.findMany({
      where: { tenantId: tenant.id, leadId: lead.id, direction: 'OUT' },
    });
    expect(messages).toHaveLength(1);
    expect(messages[0].sentByPersonId).toBe(person.id);
    expect(sendText).toHaveBeenCalledTimes(1);
  });

  it('AC-4: texto en blanco → 400, sin crear Message', async () => {
    const lead = await createLead();
    await createInboundMessage(lead.id, new Date());

    await request(app.getHttpServer())
      .post(sendUrl(lead.id))
      .set('Authorization', `Bearer ${token}`)
      .send({ text: '   ' })
      .expect(400);

    await request(app.getHttpServer())
      .post(sendUrl(lead.id))
      .set('Authorization', `Bearer ${token}`)
      .send({})
      .expect(400);

    expect(
      await prisma.message.count({
        where: { tenantId: tenant.id, leadId: lead.id, direction: 'OUT' },
      }),
    ).toBe(0);
    expect(sendText).not.toHaveBeenCalled();
  });

  it('AC-5: request autenticado por X-Api-Key (sin sesión de persona) → 403', async () => {
    const lead = await createLead();
    await createInboundMessage(lead.id, new Date());

    await request(app.getHttpServer())
      .post(sendUrl(lead.id))
      .set('X-Api-Key', apiKey)
      .send({ text: 'no debería pasar' })
      .expect(403);

    expect(
      await prisma.message.count({
        where: { tenantId: tenant.id, leadId: lead.id, direction: 'OUT' },
      }),
    ).toBe(0);
    expect(sendText).not.toHaveBeenCalled();
  });

  it('AC-13: leadId de otro tenant → 404, sin escribir nada', async () => {
    const otherTenant = await prisma.tenant.create({
      data: {
        name: 'Manual Reply Foreign Tenant',
        slug: `manual-reply-foreign-${suffix}`,
        phoneNumberId: `manual-reply-foreign-phone-${suffix}`,
        accessTokenEnc: 'irrelevante',
        apiKeyHash: await argon2.hash('x'),
      },
    });
    const foreignLead = await prisma.lead.create({
      data: {
        tenantId: otherTenant.id,
        phone: `5491199${randomBytes(4).toString('hex')}`,
      },
    });

    try {
      await request(app.getHttpServer())
        .post(sendUrl(foreignLead.id))
        .set('Authorization', `Bearer ${token}`)
        .send({ text: 'intrusión' })
        .expect(404);

      expect(
        await prisma.message.count({ where: { leadId: foreignLead.id } }),
      ).toBe(0);
    } finally {
      await prisma.tenant
        .delete({ where: { id: otherTenant.id } })
        .catch(() => undefined);
    }
  });

  it('AC-14: GET :leadId y GET :leadId/messages exponen lastInboundAt y sentByPerson', async () => {
    const lead = await createLead();
    const inbound = await createInboundMessage(lead.id, new Date());

    await request(app.getHttpServer())
      .post(sendUrl(lead.id))
      .set('Authorization', `Bearer ${token}`)
      .send({ text: 'Respuesta del asesor' })
      .expect(201);

    const getOneRes = await request(app.getHttpServer())
      .get(`/admin/tenants/${tenant.id}/leads/${lead.id}`)
      .set('X-Api-Key', apiKey)
      .expect(200);
    const leadBody = getOneRes.body as { lastInboundAt: string };
    expect(new Date(leadBody.lastInboundAt).toISOString()).toBe(
      inbound.createdAt.toISOString(),
    );

    const messagesRes = await request(app.getHttpServer())
      .get(`/admin/tenants/${tenant.id}/leads/${lead.id}/messages`)
      .set('X-Api-Key', apiKey)
      .expect(200);
    const messagesBody = messagesRes.body as {
      lead: { lastInboundAt: string };
      messages: Array<{
        direction: string;
        sentByPerson: { id: string; email: string } | null;
      }>;
    };
    expect(new Date(messagesBody.lead.lastInboundAt).toISOString()).toBe(
      inbound.createdAt.toISOString(),
    );
    const outMessage = messagesBody.messages.find(
      (m) => m.direction === 'OUT',
    );
    expect(outMessage?.sentByPerson).toEqual({
      id: person.id,
      email: person.email,
    });
  });
});
