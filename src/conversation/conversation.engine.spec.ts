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
    extraRequirements: null,
    interestedPropertyIndex: null,
    ...overrides,
  };
}

function lead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: 'lead-1',
    tenantId: TENANT.id,
    phone: '5491100000000',
    name: null,
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
function build(storedLead: Lead) {
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
    findById: jest.fn().mockResolvedValue(TENANT),
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
