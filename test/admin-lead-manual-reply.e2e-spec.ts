import { randomBytes } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  ConversationState,
  MessageDirection,
  MessageType,
  OperationType,
  PersonRole,
  type Lead,
  type Person,
  type Tenant,
} from '@prisma/client';
import * as argon2 from 'argon2';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { ConversationEngine } from '../src/conversation/conversation.engine';
import { MessagingService } from '../src/messaging/messaging.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { SERVICE_WINDOW_CLOSED_MESSAGE } from '../src/admin/leads/service-window.util';
import type { ExtractionResult } from '../src/llm/extraction.schema';
import {
  LLM_PROVIDER,
  type LlmProvider,
} from '../src/llm/llm-provider.interface';

/**
 * Extracción neutra para los turnos del `ConversationEngine` que este spec
 * dispara (AC-6 y AC-10): el LLM nunca decide nada acá, solo hace falta que
 * devuelva algo válido para ver SI fue invocado o no.
 */
function extraction(
  overrides: Partial<ExtractionResult> = {},
): ExtractionResult {
  return {
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
    ...overrides,
  };
}

/**
 * E2E de flujo completo de la spec V-B2 (T20). Cubre punta a punta, sobre HTTP
 * real con sesión de persona real (login → token) y Postgres/Redis reales:
 *
 * - AC-1 / AC-12: `send` deja exactamente UN `Message` OUT atribuido a la
 *   persona logueada, y encola el envío con ese `messageId` (nunca dos
 *   burbujas para el mismo texto).
 * - AC-2 [CRÍTICO]: `send` sobre `OPTED_OUT` → 409 sin ningún side effect.
 * - AC-3: ventana de servicio de 24hs (sin IN / IN de 25hs) → 409 con el copy
 *   del template, sin side effects.
 * - AC-4 / AC-5 / AC-13: validación, guard de sesión y 404 cross-tenant.
 * - AC-6 [CRÍTICO]: tras un `send`, el bot queda silenciado para ese lead (no
 *   invoca al LLM ni envía nada).
 * - AC-8 / AC-9 [CRÍTICOS] / AC-11: `release` devuelve el lead al estado que
 *   resuelve `resolveReleaseState`, nunca a `GREETING`.
 * - AC-10: tras `release`, el turno siguiente del lead vuelve a pasar por el
 *   `ConversationEngine`.
 * - AC-14: `lastInboundAt` / `sentByPerson` expuestos y coherentes.
 *
 * Los turnos entrantes se ejercitan invocando `ConversationEngine.handleTurn`
 * (mismo patrón que `conversation-engine.e2e-spec.ts`) en vez de POSTear al
 * webhook: el webhook solo encola, y el efecto que estos AC afirman es
 * exactamente el del turno ya desbufferizado.
 */
describe('Admin: envío manual (POST :leadId/send) (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let engine: ConversationEngine;
  let llm: jest.Mocked<LlmProvider>;
  let sendText: jest.Mock;

  const suffix = randomBytes(4).toString('hex');
  const apiKey = `test-send-api-key-${suffix}`;
  const password = 'password123';
  let tenant: Tenant;
  let person: Person;
  let token: string;

  beforeAll(async () => {
    llm = {
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
    engine = app.get(ConversationEngine);

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
    // `clearAllMocks` limpia llamadas pero conserva las implementaciones
    // (`mockResolvedValue`), a diferencia de `resetAllMocks`.
    jest.clearAllMocks();
    sendText.mockResolvedValue(undefined);
  });

  async function createLead(overrides: Partial<Lead> = {}) {
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

  async function reload(leadId: string): Promise<Lead> {
    return prisma.lead.findUniqueOrThrow({ where: { id: leadId } });
  }

  async function countOutbound(leadId: string): Promise<number> {
    return prisma.message.count({
      where: { tenantId: tenant.id, leadId, direction: MessageDirection.OUT },
    });
  }

  const sendUrl = (leadId: string) =>
    `/admin/tenants/${tenant.id}/leads/${leadId}/send`;

  const releaseUrl = (leadId: string) =>
    `/admin/tenants/${tenant.id}/leads/${leadId}/release`;

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

    // AC-12: el encolado lleva el `messageId` del Message ya persistido, que
    // es lo que hace que `OutboundProcessor` lo ACTUALICE con el `waMessageId`
    // en vez de crear una segunda burbuja para el mismo texto.
    // `MessagingService` está mockeado (no queremos pegarle a Meta desde un
    // test): su única responsabilidad real es hacer `outboundQueue.add` con
    // este payload, así que asertamos sobre sus argumentos.
    expect(sendText).toHaveBeenCalledTimes(1);
    expect(sendText).toHaveBeenCalledWith(
      expect.objectContaining({ id: tenant.id }),
      lead.phone,
      'Hola, te escribo por tu consulta',
      { messageId: messages[0].id },
    );
    expect(body.message.id).toBe(messages[0].id);
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

  it('AC-13: leadId de otro tenant → 404 en send y en release, sin escribir nada', async () => {
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
        // En HUMAN_HANDOFF a propósito: si el 404 se resolviera DESPUÉS de la
        // condición de estado, el release ajeno sería un 200 y liberaría un
        // lead de otro tenant.
        state: ConversationState.HUMAN_HANDOFF,
        handoffAt: new Date(),
      },
    });

    try {
      await request(app.getHttpServer())
        .post(sendUrl(foreignLead.id))
        .set('Authorization', `Bearer ${token}`)
        .send({ text: 'intrusión' })
        .expect(404);

      await request(app.getHttpServer())
        .post(releaseUrl(foreignLead.id))
        .set('Authorization', `Bearer ${token}`)
        .send({})
        .expect(404);

      expect(
        await prisma.message.count({ where: { leadId: foreignLead.id } }),
      ).toBe(0);
      const untouched = await reload(foreignLead.id);
      expect(untouched.state).toBe(ConversationState.HUMAN_HANDOFF);
      expect(untouched.handoffAt).not.toBeNull();
      expect(sendText).not.toHaveBeenCalled();
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
    const outMessage = messagesBody.messages.find((m) => m.direction === 'OUT');
    expect(outMessage?.sentByPerson).toEqual({
      id: person.id,
      email: person.email,
    });
  });

  it('AC-2 [CRÍTICO]: send sobre un lead OPTED_OUT → 409, 0 Messages nuevos, 0 encolados', async () => {
    const lead = await createLead({
      state: ConversationState.OPTED_OUT,
      optedOutAt: new Date(),
    });
    // Ventana de servicio ABIERTA a propósito: el único motivo posible del 409
    // acá tiene que ser el opt-out, no la ventana.
    await createInboundMessage(lead.id, new Date());

    await request(app.getHttpServer())
      .post(sendUrl(lead.id))
      .set('Authorization', `Bearer ${token}`)
      .send({ text: 'te escribo igual' })
      .expect(409);

    expect(await countOutbound(lead.id)).toBe(0);
    expect(sendText).not.toHaveBeenCalled();
    const after = await reload(lead.id);
    // El opt-out es irreversible: ni el estado ni `optedOutAt` se tocan, y el
    // lead JAMÁS queda en HUMAN_HANDOFF por un intento de envío manual.
    expect(after.state).toBe(ConversationState.OPTED_OUT);
    expect(after.handoffAt).toBeNull();
  });

  it('AC-3: lead sin ningún mensaje IN → 409 con el copy del template, sin side effects', async () => {
    const lead = await createLead({ state: ConversationState.QUALIFICATION });

    const res = await request(app.getHttpServer())
      .post(sendUrl(lead.id))
      .set('Authorization', `Bearer ${token}`)
      .send({ text: 'hola, ¿seguís buscando?' })
      .expect(409);

    expect((res.body as { message: string }).message).toBe(
      SERVICE_WINDOW_CLOSED_MESSAGE,
    );
    expect(await countOutbound(lead.id)).toBe(0);
    expect(sendText).not.toHaveBeenCalled();
    const after = await reload(lead.id);
    expect(after.state).toBe(ConversationState.QUALIFICATION);
    expect(after.handoffAt).toBeNull();
  });

  it('AC-3: lead con IN de 25hs (ventana vencida) → 409 con el copy del template, sin side effects', async () => {
    const lead = await createLead({ state: ConversationState.SEARCH_MATCH });
    await createInboundMessage(
      lead.id,
      new Date(Date.now() - 25 * 60 * 60 * 1000),
    );

    const res = await request(app.getHttpServer())
      .post(sendUrl(lead.id))
      .set('Authorization', `Bearer ${token}`)
      .send({ text: 'te paso otra opción' })
      .expect(409);

    expect((res.body as { message: string }).message).toBe(
      SERVICE_WINDOW_CLOSED_MESSAGE,
    );
    expect(await countOutbound(lead.id)).toBe(0);
    expect(sendText).not.toHaveBeenCalled();
    const after = await reload(lead.id);
    expect(after.state).toBe(ConversationState.SEARCH_MATCH);
    expect(after.handoffAt).toBeNull();
  });

  it('AC-6 [CRÍTICO]: tras un send, el turno siguiente del lead no invoca al LLM ni encola nada', async () => {
    const lead = await createLead({
      state: ConversationState.QUALIFICATION,
      fOperation: OperationType.RENT,
    });
    await createInboundMessage(lead.id, new Date());

    await request(app.getHttpServer())
      .post(sendUrl(lead.id))
      .set('Authorization', `Bearer ${token}`)
      .send({ text: 'Hola, soy Vale del equipo comercial' })
      .expect(201);
    expect((await reload(lead.id)).state).toBe(ConversationState.HUMAN_HANDOFF);

    // A partir de acá el lead está tomado por una persona: el bot debe quedar
    // mudo, exactamente igual que si el lead hubiese pedido un humano (el AC no
    // distingue el origen del HUMAN_HANDOFF).
    sendText.mockClear();
    llm.extractIntent.mockResolvedValue(extraction({ intent: 'other' }));
    llm.composeReply.mockResolvedValue('esto no debería enviarse nunca');

    await engine.handleTurn(tenant.id, lead.id, '¿hay alguien ahí?');

    expect(llm.extractIntent).not.toHaveBeenCalled();
    expect(llm.composeReply).not.toHaveBeenCalled();
    expect(sendText).not.toHaveBeenCalled();
    const after = await reload(lead.id);
    expect(after.state).toBe(ConversationState.HUMAN_HANDOFF);
    // Sigue habiendo exactamente el OUT del asesor: el bot no agregó ninguno.
    expect(await countOutbound(lead.id)).toBe(1);
  });

  it('AC-8 [CRÍTICO]: release con lastSearchIds no vacío → SEARCH_MATCH y handoffAt null', async () => {
    const property = await prisma.property.create({
      data: {
        tenantId: tenant.id,
        externalRef: `release-${randomBytes(3).toString('hex')}`,
        title: 'Depto en Caballito',
        operation: OperationType.RENT,
        propertyType: 'departamento',
        price: 400000,
        currency: 'ARS',
        neighborhood: 'caballito',
        rooms: 2,
      },
    });
    const lead = await createLead({
      state: ConversationState.HUMAN_HANDOFF,
      handoffAt: new Date(),
      fOperation: OperationType.RENT,
      lastSearchIds: [property.id],
    });

    const res = await request(app.getHttpServer())
      .post(releaseUrl(lead.id))
      .set('Authorization', `Bearer ${token}`)
      .send({})
      .expect(200);
    expect(res.body).toEqual({ released: true });

    const after = await reload(lead.id);
    expect(after.state).toBe(ConversationState.SEARCH_MATCH);
    expect(after.handoffAt).toBeNull();
    // Nunca vuelve a GREETING: eso repetiría el saludo + aviso Ley 25.326 a un
    // lead que ya los recibió.
    expect(after.state).not.toBe(ConversationState.GREETING);
    expect(after.lastSearchIds).toEqual([property.id]);
  });

  it('AC-9 [CRÍTICO]: release con lastSearchIds vacío → QUALIFICATION y handoffAt null', async () => {
    const lead = await createLead({
      state: ConversationState.HUMAN_HANDOFF,
      handoffAt: new Date(),
      fOperation: OperationType.RENT,
      lastSearchIds: [],
    });

    await request(app.getHttpServer())
      .post(releaseUrl(lead.id))
      .set('Authorization', `Bearer ${token}`)
      .send({})
      .expect(200);

    const after = await reload(lead.id);
    expect(after.state).toBe(ConversationState.QUALIFICATION);
    expect(after.handoffAt).toBeNull();
  });

  it('AC-11: release sobre un lead que no está en HUMAN_HANDOFF → 400 sin cambios', async () => {
    const lead = await createLead({
      state: ConversationState.QUALIFICATION,
      lastSearchIds: [],
    });

    await request(app.getHttpServer())
      .post(releaseUrl(lead.id))
      .set('Authorization', `Bearer ${token}`)
      .send({})
      .expect(400);

    expect((await reload(lead.id)).state).toBe(ConversationState.QUALIFICATION);

    // Un lead que pidió la baja tampoco se puede "liberar" a un estado activo.
    const optedOut = await createLead({
      state: ConversationState.OPTED_OUT,
      optedOutAt: new Date(),
    });
    await request(app.getHttpServer())
      .post(releaseUrl(optedOut.id))
      .set('Authorization', `Bearer ${token}`)
      .send({})
      .expect(400);
    expect((await reload(optedOut.id)).state).toBe(ConversationState.OPTED_OUT);
  });

  it('AC-10: tras el release, el turno siguiente del lead vuelve a pasar por el ConversationEngine', async () => {
    const lead = await createLead({
      state: ConversationState.QUALIFICATION,
      fOperation: OperationType.RENT,
    });
    await createInboundMessage(lead.id, new Date());

    // 1) El asesor toma la conversación: el bot queda silenciado.
    await request(app.getHttpServer())
      .post(sendUrl(lead.id))
      .set('Authorization', `Bearer ${token}`)
      .send({ text: 'Te sigo yo por acá' })
      .expect(201);

    // 2) El asesor la devuelve al agente IA.
    await request(app.getHttpServer())
      .post(releaseUrl(lead.id))
      .set('Authorization', `Bearer ${token}`)
      .send({})
      .expect(200);
    expect((await reload(lead.id)).state).toBe(ConversationState.QUALIFICATION);

    // 3) El lead escribe de nuevo: ahora sí lo atiende el bot.
    sendText.mockClear();
    llm.extractIntent.mockResolvedValue(extraction({ intent: 'off_topic' }));
    llm.composeReply.mockResolvedValue(
      'Prefiero ayudarte con tu búsqueda de propiedades. ¿Seguimos?',
    );

    await engine.handleTurn(tenant.id, lead.id, '¿qué pensás de Milei?');

    expect(llm.extractIntent).toHaveBeenCalledTimes(1);
    expect(sendText).toHaveBeenCalledWith(
      expect.objectContaining({ id: tenant.id }),
      lead.phone,
      'Prefiero ayudarte con tu búsqueda de propiedades. ¿Seguimos?',
    );
    expect((await reload(lead.id)).state).toBe(ConversationState.QUALIFICATION);
  });
});
