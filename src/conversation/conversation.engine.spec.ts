import {
  ConversationState,
  OperationType,
  type Lead,
  type Prisma,
  type Tenant,
} from '@prisma/client';
import type { ExtractionResult } from '../llm/extraction.schema';
import type { LlmProvider } from '../llm/llm-provider.interface';
import type { MessagingService } from '../messaging/messaging.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { TenantsService } from '../tenants/tenants.service';
import { ConversationEngine } from './conversation.engine';
import type { HandlerResult } from './conversation.types';
import { GuardrailsService } from './guardrails/guardrails.service';
import type { CommercialQualificationHandler } from './handlers/commercial-qualification.handler';
import type { GreetingHandler } from './handlers/greeting.handler';
import type { QualificationHandler } from './handlers/qualification.handler';
import type { SchedulingHandler } from './handlers/scheduling.handler';
import type { SearchMatchHandler } from './handlers/search-match.handler';
import type { LeadAlertService } from './lead-alert.service';
import { OutputValidatorService } from './output-validator.service';
import type { SafeReplyService } from './safe-reply.service';
import { HANDOFF_TIMEOUT_APOLOGY } from './templates';

const FIFTY_HOURS_AGO = new Date(Date.now() - 50 * 60 * 60 * 1000);

const TENANT = { id: 'tenant-1', name: 'Inmobiliaria Test' } as Tenant;

function extraction(
  overrides: Partial<ExtractionResult> = {},
): ExtractionResult {
  return {
    intent: 'other',
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
    ...overrides,
  };
}

function lead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: 'lead-1',
    tenantId: TENANT.id,
    phone: '5491100000000',
    name: null,
    nameAskedAt: null,
    state: ConversationState.QUALIFICATION,
    greetedAt: new Date(),
    handoffAt: null,
    optedOutAt: null,
    lastMessageAt: new Date(),
    turnCount: 3,
    lastSearchIds: [],
    fOperation: null,
    fNeighborhoods: [],
    fMaxPrice: null,
    fCurrency: null,
    fMinRooms: null,
    fGarage: null,
    fPetsAllowed: null,
    fNotes: null,
    fOfferedNeighborhoods: [],
    fPriceMentionedAtTurn: null,
    fPreferredDay: null,
    ...overrides,
  } as unknown as Lead;
}

/**
 * Motor con todas sus dependencias mockeadas salvo las puras
 * (`GuardrailsService`, `OutputValidatorService`), que se usan reales para que
 * la acción de guardrail bajo prueba salga del mismo camino que en producción.
 */
function build(storedLead: Lead, tenant: Tenant = TENANT) {
  const prisma = {
    lead: {
      findUnique: jest.fn().mockResolvedValue(storedLead),
      // El motor relee el lead de la DB después de despachar al handler: en
      // este punto el release por timeout todavía no se persistió, así que la
      // DB sigue devolviendo el lead tal cual estaba.
      findUniqueOrThrow: jest.fn().mockResolvedValue(storedLead),
      update: jest.fn().mockResolvedValue(storedLead),
    },
    message: { findMany: jest.fn().mockResolvedValue([]) },
  } as unknown as PrismaService;

  const tenants = {
    findById: jest.fn().mockResolvedValue(tenant),
  } as unknown as TenantsService;

  const messaging = {
    sendText: jest.fn().mockResolvedValue(undefined),
    sendImage: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<MessagingService>;

  const llm = {
    extractIntent: jest.fn().mockResolvedValue(extraction()),
    composeReply: jest.fn().mockResolvedValue('respuesta'),
  } as unknown as jest.Mocked<LlmProvider>;

  const safeReply = {
    compose: jest.fn().mockResolvedValue('respuesta segura'),
  } as unknown as jest.Mocked<SafeReplyService>;

  const leadAlert = {
    notify: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<LeadAlertService>;

  // Cada handler devuelve el estado en el que lo invocaron: así el test
  // observa a qué rama de la FSM se despachó el turno.
  const handlerResult = (state: ConversationState): HandlerResult => ({
    actions: [],
    nextState: state,
  });
  const greeting = {
    handle: jest
      .fn()
      .mockResolvedValue(handlerResult(ConversationState.GREETING)),
  } as unknown as jest.Mocked<GreetingHandler>;
  const qualification = {
    handle: jest
      .fn()
      .mockResolvedValue(handlerResult(ConversationState.QUALIFICATION)),
  } as unknown as jest.Mocked<QualificationHandler>;
  const searchMatch = {
    handle: jest
      .fn()
      .mockResolvedValue(handlerResult(ConversationState.SEARCH_MATCH)),
  } as unknown as jest.Mocked<SearchMatchHandler>;
  const commercialQualification = {
    handle: jest
      .fn()
      .mockResolvedValue(
        handlerResult(ConversationState.COMMERCIAL_QUALIFICATION),
      ),
  } as unknown as jest.Mocked<CommercialQualificationHandler>;
  const scheduling = {
    handle: jest
      .fn()
      .mockResolvedValue(handlerResult(ConversationState.SCHEDULING)),
  } as unknown as jest.Mocked<SchedulingHandler>;

  const engine = new ConversationEngine(
    prisma,
    tenants,
    messaging,
    new GuardrailsService(),
    llm,
    safeReply,
    new OutputValidatorService(),
    leadAlert,
    greeting,
    qualification,
    searchMatch,
    commercialQualification,
    scheduling,
  );

  return {
    engine,
    prisma,
    messaging,
    llm,
    leadAlert,
    greeting,
    qualification,
    searchMatch,
    commercialQualification,
    scheduling,
  };
}

/** Estado con el que el motor terminó persistiendo el lead (único update del turno). */
function persistedState(prisma: PrismaService): ConversationState {
  const update = prisma.lead.update as unknown as jest.Mock<
    unknown,
    [{ data: Prisma.LeadUpdateInput }]
  >;
  expect(update).toHaveBeenCalledTimes(1);
  return update.mock.calls[0][0].data.state as ConversationState;
}

describe('ConversationEngine — handoff_timeout_release (AC-8, timeout de 48hs)', () => {
  it('un lead con lastSearchIds no vacío vuelve a SEARCH_MATCH, no a QUALIFICATION', async () => {
    const stored = lead({
      state: ConversationState.HUMAN_HANDOFF,
      handoffAt: FIFTY_HOURS_AGO,
      lastSearchIds: ['prop-1', 'prop-2'],
      fOperation: OperationType.RENT,
    });
    const { engine, prisma, searchMatch, qualification } = build(stored);

    await engine.handleTurn(TENANT.id, stored.id, 'hola, siguen ahí?');

    expect(searchMatch.handle).toHaveBeenCalledTimes(1);
    expect(qualification.handle).not.toHaveBeenCalled();
    expect(persistedState(prisma)).toBe(ConversationState.SEARCH_MATCH);
  });

  it('un lead con lastSearchIds vacío sigue volviendo a QUALIFICATION', async () => {
    const stored = lead({
      state: ConversationState.HUMAN_HANDOFF,
      handoffAt: FIFTY_HOURS_AGO,
      lastSearchIds: [],
    });
    const { engine, prisma, searchMatch, qualification } = build(stored);

    await engine.handleTurn(TENANT.id, stored.id, 'hola, siguen ahí?');

    expect(qualification.handle).toHaveBeenCalledTimes(1);
    expect(searchMatch.handle).not.toHaveBeenCalled();
    expect(persistedState(prisma)).toBe(ConversationState.QUALIFICATION);
  });

  // AC-9: `fOperation` no participa de la decisión; sin fichas mostradas el
  // retorno es QUALIFICATION esté seteado o no (mismo criterio que el release
  // manual del admin).
  it('sin lastSearchIds vuelve a QUALIFICATION aunque fOperation esté seteado', async () => {
    const stored = lead({
      state: ConversationState.HUMAN_HANDOFF,
      handoffAt: FIFTY_HOURS_AGO,
      lastSearchIds: [],
      fOperation: OperationType.SALE,
    });
    const { engine, prisma } = build(stored);

    await engine.handleTurn(TENANT.id, stored.id, 'hola, siguen ahí?');

    expect(persistedState(prisma)).toBe(ConversationState.QUALIFICATION);
  });

  it('manda la disculpa del timeout antes que la respuesta del turno, y no vuelve a alertar al tenant', async () => {
    const stored = lead({
      state: ConversationState.HUMAN_HANDOFF,
      handoffAt: FIFTY_HOURS_AGO,
      lastSearchIds: ['prop-1'],
    });
    const { engine, messaging, leadAlert, llm } = build(stored);

    await engine.handleTurn(TENANT.id, stored.id, 'hola, siguen ahí?');

    expect(messaging.sendText.mock.calls[0][2]).toBe(HANDOFF_TIMEOUT_APOLOGY);
    // El gating de guardrails no cambia: la liberación por timeout no es un
    // handoff nuevo (no notifica) y el turno sí llega al LLM.
    expect(leadAlert.notify).not.toHaveBeenCalled();
    expect(llm.extractIntent).toHaveBeenCalledTimes(1);
  });
});

describe('ConversationEngine — guardrails no tocados por T11', () => {
  it('un lead en HUMAN_HANDOFF dentro de las 48hs sigue silenciado (no llega al LLM ni a la FSM)', async () => {
    const stored = lead({
      state: ConversationState.HUMAN_HANDOFF,
      handoffAt: new Date(Date.now() - 60 * 60 * 1000),
      lastSearchIds: ['prop-1'],
    });
    const { engine, prisma, messaging, llm, qualification, searchMatch } =
      build(stored);

    await engine.handleTurn(TENANT.id, stored.id, 'hola, hay alguien?');

    expect(messaging.sendText).not.toHaveBeenCalled();
    expect(llm.extractIntent).not.toHaveBeenCalled();
    expect(qualification.handle).not.toHaveBeenCalled();
    expect(searchMatch.handle).not.toHaveBeenCalled();
    expect(prisma.lead.update).not.toHaveBeenCalled();
  });

  it('"BAJA" sigue pasando a OPTED_OUT sin invocar al LLM', async () => {
    const stored = lead({ state: ConversationState.QUALIFICATION });
    const { engine, prisma, llm } = build(stored);

    await engine.handleTurn(TENANT.id, stored.id, 'BAJA');

    expect(llm.extractIntent).not.toHaveBeenCalled();
    expect(persistedState(prisma)).toBe(ConversationState.OPTED_OUT);
  });

  it('el pedido explícito de humano sigue pasando a HUMAN_HANDOFF y alertando al tenant', async () => {
    const stored = lead({
      state: ConversationState.QUALIFICATION,
      lastSearchIds: ['prop-1'],
    });
    const { engine, prisma, leadAlert } = build(stored);

    await engine.handleTurn(
      TENANT.id,
      stored.id,
      'quiero hablar con una persona',
    );

    expect(leadAlert.notify).toHaveBeenCalledTimes(1);
    expect(persistedState(prisma)).toBe(ConversationState.HUMAN_HANDOFF);
  });
});

/**
 * AC-6 [CRÍTICO] — con el lead en `HUMAN_HANDOFF` el motor no invoca al LLM ni
 * a los handlers de la FSM, y eso vale también cuando el handoff lo produjo el
 * envío manual de un asesor (`AdminLeadMessagingService.sendManual`, T8) y no
 * un pedido explícito del lead.
 *
 * DECISIÓN DOCUMENTADA: el AC no distingue "el lead pidió hablar con un
 * humano" de "el asesor tomó la conversación". `sendManual` deja exactamente
 * el mismo rastro que el guardrail `handoff` (`state = HUMAN_HANDOFF` +
 * `handoffAt = <ahora>`), no hay marca de origen en el lead, y el gating del
 * motor mira solo el estado. Los fixtures de acá replican el lead post-`send`.
 */
describe('ConversationEngine — AC-6: HUMAN_HANDOFF originado por `send` del asesor', () => {
  /** Lead tal cual lo deja `sendManual`, tomado a mitad del flujo de búsqueda. */
  function handoffBySendManual(overrides: Partial<Lead> = {}): Lead {
    return lead({
      state: ConversationState.HUMAN_HANDOFF,
      handoffAt: new Date(),
      lastSearchIds: ['prop-1', 'prop-2'],
      fOperation: OperationType.RENT,
      turnCount: 7,
      ...overrides,
    });
  }

  it('no invoca al LlmProvider ni a ningún handler de la FSM para el turno entrante', async () => {
    const stored = handoffBySendManual();
    const {
      engine,
      prisma,
      messaging,
      llm,
      leadAlert,
      greeting,
      qualification,
      searchMatch,
      scheduling,
    } = build(stored);

    await engine.handleTurn(
      TENANT.id,
      stored.id,
      'me interesa el segundo, cuánto son las expensas?',
    );

    // El LLM no ve el turno: ni extracción ni redacción.
    expect(llm.extractIntent).not.toHaveBeenCalled();
    expect(llm.composeReply).not.toHaveBeenCalled();
    // Ningún handler de la FSM despacha el turno.
    expect(greeting.handle).not.toHaveBeenCalled();
    expect(qualification.handle).not.toHaveBeenCalled();
    expect(searchMatch.handle).not.toHaveBeenCalled();
    expect(scheduling.handle).not.toHaveBeenCalled();
    // Y no sale nada por WhatsApp ni se toca el estado del lead: el turno
    // queda para el asesor, que ya está escribiendo desde la bandeja.
    expect(messaging.sendText).not.toHaveBeenCalled();
    expect(messaging.sendImage).not.toHaveBeenCalled();
    expect(prisma.lead.update).not.toHaveBeenCalled();
    // Tampoco se re-alerta al tenant: el asesor ya tomó la conversación.
    expect(leadAlert.notify).not.toHaveBeenCalled();
  });

  it('tampoco responde si el lead insiste con pedir un humano estando ya en modo manual', async () => {
    const stored = handoffBySendManual();
    const { engine, prisma, messaging, llm, leadAlert } = build(stored);

    await engine.handleTurn(
      TENANT.id,
      stored.id,
      'quiero hablar con una persona real',
    );

    expect(llm.extractIntent).not.toHaveBeenCalled();
    expect(messaging.sendText).not.toHaveBeenCalled();
    expect(leadAlert.notify).not.toHaveBeenCalled();
    expect(prisma.lead.update).not.toHaveBeenCalled();
  });

  // AC-2: el silenciado del modo manual no puede tapar un pedido de baja.
  it('"BAJA" durante el modo manual sigue pasando a OPTED_OUT sin invocar al LLM', async () => {
    const stored = handoffBySendManual();
    const { engine, prisma, llm, qualification, searchMatch } = build(stored);

    await engine.handleTurn(TENANT.id, stored.id, 'BAJA');

    expect(llm.extractIntent).not.toHaveBeenCalled();
    expect(qualification.handle).not.toHaveBeenCalled();
    expect(searchMatch.handle).not.toHaveBeenCalled();
    expect(persistedState(prisma)).toBe(ConversationState.OPTED_OUT);
  });

  // Contracara del silenciado: pasadas las 48hs del `send`, el mismo lead sí
  // vuelve al bot (mismo camino de release que el handoff pedido por el lead).
  it('a las 48hs del `send` el bot retoma: llega al LLM y a la FSM', async () => {
    const stored = handoffBySendManual({ handoffAt: FIFTY_HOURS_AGO });
    const { engine, prisma, messaging, llm, searchMatch } = build(stored);

    await engine.handleTurn(TENANT.id, stored.id, 'hola, siguen ahí?');

    expect(llm.extractIntent).toHaveBeenCalledTimes(1);
    expect(searchMatch.handle).toHaveBeenCalledTimes(1);
    expect(messaging.sendText.mock.calls[0][2]).toBe(HANDOFF_TIMEOUT_APOLOGY);
    expect(persistedState(prisma)).toBe(ConversationState.SEARCH_MATCH);
  });
});

// spec 09, T2.4: registro formal configurable por tenant, aplicado de forma
// centralizada en `sendActions` sobre TODO texto saliente (fijo o del LLM).
describe('ConversationEngine — botFormality (T2.4)', () => {
  const FORMAL_TENANT = { ...TENANT, botFormality: 'formal' } as Tenant;
  const RAW_TEXT = '¡Dale, mirá esto! 🙂 ¿Te sirve?';

  it('AC-9: con tenant "formal", saca emojis y la muletilla del inicio antes de enviar', async () => {
    const stored = lead({ state: ConversationState.QUALIFICATION });
    const { engine, messaging, qualification } = build(stored, FORMAL_TENANT);
    qualification.handle.mockResolvedValue({
      actions: [{ kind: 'text', text: RAW_TEXT }],
      nextState: ConversationState.QUALIFICATION,
    });

    await engine.handleTurn(FORMAL_TENANT.id, stored.id, 'hola');

    const sentText = messaging.sendText.mock.calls[0][2] as string;
    expect(sentText).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(sentText.toLowerCase()).not.toContain('dale,');
  });

  it('AC-10: con tenant sin botFormality (default), el texto sale sin tocar (regresión)', async () => {
    const stored = lead({ state: ConversationState.QUALIFICATION });
    const { engine, messaging, qualification } = build(stored, TENANT);
    qualification.handle.mockResolvedValue({
      actions: [{ kind: 'text', text: RAW_TEXT }],
      nextState: ConversationState.QUALIFICATION,
    });

    await engine.handleTurn(TENANT.id, stored.id, 'hola');

    expect(messaging.sendText.mock.calls[0][2]).toBe(RAW_TEXT);
  });
});

// spec 09, T1.1: captura del nombre del lead, siempre desde la extracción de
// ESTE turno, y nunca pisando un nombre ya guardado.
describe('ConversationEngine — captura de nombre (T1.1)', () => {
  it('AC-14: si la extracción trae un nombre y el lead no tenía, lo persiste', async () => {
    const stored = lead({ name: null });
    const { engine, prisma, llm } = build(stored);
    (llm.extractIntent as jest.Mock).mockResolvedValue(
      extraction({ name: 'Martín' }),
    );

    await engine.handleTurn(TENANT.id, stored.id, 'hola soy Martín');

    const update = prisma.lead.update as unknown as jest.Mock<
      unknown,
      [{ data: Prisma.LeadUpdateInput }]
    >;
    expect(update.mock.calls[0][0].data.name).toBe('Martín');
  });

  it('nunca pisa un nombre ya guardado, aunque la extracción traiga otro', async () => {
    const stored = lead({ name: 'Ana' });
    const { engine, prisma, llm } = build(stored);
    (llm.extractIntent as jest.Mock).mockResolvedValue(
      extraction({ name: 'Martín' }),
    );

    await engine.handleTurn(TENANT.id, stored.id, 'hola soy Martín');

    const update = prisma.lead.update as unknown as jest.Mock<
      unknown,
      [{ data: Prisma.LeadUpdateInput }]
    >;
    expect(update.mock.calls[0][0].data.name).toBeUndefined();
  });

  it('sin nombre en la extracción, no toca el campo name', async () => {
    const stored = lead({ name: null });
    const { engine, prisma } = build(stored);

    await engine.handleTurn(TENANT.id, stored.id, 'busco en caballito');

    const update = prisma.lead.update as unknown as jest.Mock<
      unknown,
      [{ data: Prisma.LeadUpdateInput }]
    >;
    expect(update.mock.calls[0][0].data.name).toBeUndefined();
  });
});

// spec 09, T1.4: el estado nuevo se despacha al handler correcto y persiste
// su `commercialUpdate` centralizadamente (nunca escribe directo a la DB).
describe('ConversationEngine — dispatch a COMMERCIAL_QUALIFICATION (T1.4)', () => {
  it('un lead en COMMERCIAL_QUALIFICATION despacha a ese handler, no a searchMatch ni qualification', async () => {
    const stored = lead({ state: ConversationState.COMMERCIAL_QUALIFICATION });
    const { engine, commercialQualification, searchMatch, qualification, prisma } =
      build(stored);

    await engine.handleTurn(TENANT.id, stored.id, 'tengo garantía propietaria');

    expect(commercialQualification.handle).toHaveBeenCalledTimes(1);
    expect(searchMatch.handle).not.toHaveBeenCalled();
    expect(qualification.handle).not.toHaveBeenCalled();
    expect(persistedState(prisma)).toBe(
      ConversationState.COMMERCIAL_QUALIFICATION,
    );
  });

  it('persiste commercialUpdate devuelto por el handler (qGuarantee, qAskedFields)', async () => {
    const stored = lead({ state: ConversationState.COMMERCIAL_QUALIFICATION });
    const { engine, commercialQualification, prisma } = build(stored);
    commercialQualification.handle.mockResolvedValue({
      actions: [],
      nextState: ConversationState.COMMERCIAL_QUALIFICATION,
      commercialUpdate: {
        qGuarantee: 'propietaria',
        qAskedFields: ['guarantee', 'timeline'],
      },
    });

    await engine.handleTurn(TENANT.id, stored.id, 'tengo garantía propietaria');

    const update = prisma.lead.update as unknown as jest.Mock<
      unknown,
      [{ data: Prisma.LeadUpdateInput }]
    >;
    expect(update.mock.calls[0][0].data.qGuarantee).toBe('propietaria');
    expect(update.mock.calls[0][0].data.qAskedFields).toEqual([
      'guarantee',
      'timeline',
    ]);
  });

  it('con pendingPropertyId: null en commercialUpdate, lo limpia (no queda undefined = "sin tocar")', async () => {
    const stored = lead({ state: ConversationState.COMMERCIAL_QUALIFICATION });
    const { engine, commercialQualification, prisma } = build(stored);
    commercialQualification.handle.mockResolvedValue({
      actions: [],
      nextState: ConversationState.HUMAN_HANDOFF,
      commercialUpdate: { pendingPropertyId: null },
    });

    await engine.handleTurn(TENANT.id, stored.id, 'listo, gracias');

    const update = prisma.lead.update as unknown as jest.Mock<
      unknown,
      [{ data: Prisma.LeadUpdateInput }]
    >;
    expect(update.mock.calls[0][0].data.pendingPropertyId).toBeNull();
  });
});

// spec 09, T1.5, AC-38: el score se recalcula SIEMPRE en código al final de
// cada turno, ya sobre el lead con los cambios de ESTE turno aplicados.
describe('ConversationEngine — persistencia del score (T1.5)', () => {
  it('AC-38: persiste qScore y qScoreLabel en cada turno, aunque el handler no diga nada de score', async () => {
    const stored = lead({ state: ConversationState.QUALIFICATION });
    const { engine, prisma } = build(stored);

    await engine.handleTurn(TENANT.id, stored.id, 'hola');

    const update = prisma.lead.update as unknown as jest.Mock<
      unknown,
      [{ data: Prisma.LeadUpdateInput }]
    >;
    expect(typeof update.mock.calls[0][0].data.qScore).toBe('number');
    expect(update.mock.calls[0][0].data.qScoreLabel).toBe('frio');
  });

  it('el score sube en el MISMO turno en que se contesta una pregunta comercial (no recién en el siguiente)', async () => {
    const stored = lead({
      state: ConversationState.COMMERCIAL_QUALIFICATION,
      fOperation: OperationType.RENT,
      qAskedFields: ['guarantee'],
    });
    const { engine, commercialQualification, prisma } = build(stored);
    commercialQualification.handle.mockResolvedValue({
      actions: [],
      nextState: ConversationState.COMMERCIAL_QUALIFICATION,
      commercialUpdate: { qGuarantee: 'propietaria' },
    });

    await engine.handleTurn(TENANT.id, stored.id, 'tengo garantía propietaria');

    const update = prisma.lead.update as unknown as jest.Mock<
      unknown,
      [{ data: Prisma.LeadUpdateInput }]
    >;
    // 30 (ya había interés, qAskedFields no vacío) + 20 (garantía propietaria, RENT)
    expect(update.mock.calls[0][0].data.qScore).toBe(50);
  });
});
