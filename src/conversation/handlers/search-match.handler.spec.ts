import { ConversationState } from '@prisma/client';
import { SearchMatchHandler } from './search-match.handler';
import { QualificationHandler } from './qualification.handler';
import { SchedulingHandler } from './scheduling.handler';
import { PrismaService } from '../../prisma/prisma.service';
import { SafeReplyService } from '../safe-reply.service';
import type { HandlerContext, LeadFilters } from '../conversation.types';

/**
 * QA 2026-07-27 (WhatsApp real): "me interesa el segundo, de cuanto son las
 * expensas?" saltaba directo a `SchedulingHandler.enterScheduling` (agenda +
 * HUMAN_HANDOFF) sin contestar la pregunta de expensas. Este spec cubre el
 * corte agregado en `SearchMatchHandler.handle`: si el mismo mensaje trae una
 * pregunta sin responder, contestamos con los datos reales de la propiedad
 * (nunca inventados) y NO agendamos todavía.
 */
describe('SearchMatchHandler — pregunta + interés en la misma propiedad', () => {
  const tenant = { id: 'tenant-1' } as HandlerContext['tenant'];
  const lead = {
    id: 'lead-1',
    lastSearchIds: ['prop-1', 'prop-2'],
  } as HandlerContext['lead'];
  const property = {
    id: 'prop-2',
    title: 'Monoambiente luminoso a metros del Botánico',
    operation: 'RENT',
    propertyType: 'departamento',
    price: 450,
    currency: 'USD',
    expenses: 30000,
    neighborhood: 'palermo',
    rooms: 1,
    bedrooms: null,
    bathrooms: null,
    areaM2: null,
    garage: false,
    petsAllowed: false,
    features: ['balcón'],
    description: null,
    photos: [],
  };

  let qualification: { handle: jest.Mock };
  let scheduling: { enterScheduling: jest.Mock; handle: jest.Mock };
  let prisma: { property: { findUnique: jest.Mock } };
  let safeReply: { compose: jest.Mock };
  let handler: SearchMatchHandler;

  beforeEach(() => {
    qualification = { handle: jest.fn() };
    scheduling = {
      enterScheduling: jest.fn().mockResolvedValue({
        actions: [],
        nextState: ConversationState.HUMAN_HANDOFF,
      }),
      handle: jest.fn(),
    };
    prisma = { property: { findUnique: jest.fn().mockResolvedValue(property) } };
    safeReply = {
      compose: jest.fn().mockResolvedValue('Las expensas son ARS 30.000. ¿Querés que te coordine la visita?'),
    };

    handler = new SearchMatchHandler(
      qualification as unknown as QualificationHandler,
      scheduling as unknown as SchedulingHandler,
      prisma as unknown as PrismaService,
      safeReply as unknown as SafeReplyService,
    );
  });

  function ctx(turnText: string, interestedPropertyIndex: number | null, intent = 'show_interest'): HandlerContext {
    return {
      tenant,
      lead,
      turnText,
      extraction: {
        intent,
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
        interestedPropertyIndex,
      },
      recentMessages: [],
    } as HandlerContext;
  }

  const filters = {} as LeadFilters;

  it('con pregunta en el mismo mensaje, contesta con datos reales y NO agenda', async () => {
    const result = await handler.handle(
      ctx('Me interesa el segundo, de cuanto son las expensas?', 2),
      filters,
    );

    expect(scheduling.enterScheduling).not.toHaveBeenCalled();
    expect(safeReply.compose).toHaveBeenCalledTimes(1);
    const [[input]] = safeReply.compose.mock.calls;
    expect(input.instruction).toContain('expensas: ARS 30.000');
    expect(result.nextState).toBe(ConversationState.SEARCH_MATCH);
    expect(result.actions[0]).toMatchObject({
      kind: 'text',
      text: expect.stringContaining('expensas'),
    });
  });

  it('sin pregunta, sigue agendando de una (no regresión)', async () => {
    const result = await handler.handle(ctx('me interesa el segundo', 2), filters);

    expect(safeReply.compose).not.toHaveBeenCalled();
    expect(scheduling.enterScheduling).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: 'prop-2' }),
    );
    expect(result.nextState).toBe(ConversationState.HUMAN_HANDOFF);
  });

  it('intent ask_question (sin "?") también cuenta como pregunta sin responder', async () => {
    await handler.handle(
      ctx('me interesa el segundo, cuanto sale de expensas', 2, 'ask_question'),
      filters,
    );

    expect(scheduling.enterScheduling).not.toHaveBeenCalled();
    expect(safeReply.compose).toHaveBeenCalledTimes(1);
  });

  it('no confirma elección (falso positivo del LLM) -> re-pregunta, sin tocar scheduling ni safeReply', async () => {
    const result = await handler.handle(ctx('2 amb estaria joya', 2), filters);

    expect(scheduling.enterScheduling).not.toHaveBeenCalled();
    expect(safeReply.compose).not.toHaveBeenCalled();
    expect(result.nextState).toBe(ConversationState.SEARCH_MATCH);
  });
});
