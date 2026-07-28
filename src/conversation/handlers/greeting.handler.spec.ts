import { ConversationState } from '@prisma/client';
import { GreetingHandler } from './greeting.handler';
import { QualificationHandler } from './qualification.handler';
import { PropertySearchService } from '../../properties/property-search.service';
import { SafeReplyService } from '../safe-reply.service';
import type { ExtractionResult } from '../../llm/extraction.schema';
import type { HandlerContext, LeadFilters } from '../conversation.types';
import { SEEN_LISTING_ACK } from '../templates';

/**
 * Mejora de conversación (2026-07-28): el pedido de nombre se movió a apenas
 * se confirma comprar/alquilar (antes de mostrar teaser/búsqueda), en vez de
 * apilarse junto con el cierre del teaser — evita que el lead reciba 3-4
 * preguntas encadenadas en el mismo burst de mensajes. También se agrega el
 * reconocimiento de "vi una propiedad puntual" en el saludo.
 */
describe('GreetingHandler', () => {
  const tenant = {
    id: 'tenant-1',
    name: 'Inmobiliaria Demo',
    botName: 'INMOAGENT',
    welcomeIntro: null,
    humanHours: null,
  } as HandlerContext['tenant'];

  let qualification: { handle: jest.Mock; suggestAlternativeZones: jest.Mock };
  let propertySearch: { hasStockInZone: jest.Mock };
  let safeReply: { compose: jest.Mock };
  let handler: GreetingHandler;

  beforeEach(() => {
    qualification = {
      handle: jest.fn(),
      suggestAlternativeZones: jest.fn(),
    };
    propertySearch = { hasStockInZone: jest.fn().mockResolvedValue(true) };
    safeReply = { compose: jest.fn() };
    handler = new GreetingHandler(
      qualification as unknown as QualificationHandler,
      propertySearch as unknown as PropertySearchService,
      safeReply as unknown as SafeReplyService,
    );
  });

  function extraction(overrides: Partial<ExtractionResult> = {}): ExtractionResult {
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

  function ctx(
    turnText: string,
    leadOverrides: Partial<{
      greetedAt: Date | null;
      name: string | null;
      nameAskedAt: Date | null;
    }> = {},
    extractionOverrides: Partial<ExtractionResult> = {},
  ): HandlerContext {
    return {
      tenant,
      lead: {
        id: 'lead-1',
        state: ConversationState.GREETING,
        turnCount: 1,
        greetedAt: null,
        name: null,
        nameAskedAt: null,
        ...leadOverrides,
      },
      turnText,
      extraction: extraction(extractionOverrides),
      recentMessages: [],
    } as unknown as HandlerContext;
  }

  const filtersWithOperation: LeadFilters = {
    fOperation: 'SALE' as LeadFilters['fOperation'],
    fNeighborhoods: ['palermo'],
    fMaxPrice: null,
    fCurrency: null,
    fMinRooms: null,
    fGarage: null,
    fPetsAllowed: null,
    fNotes: null,
    fOfferedNeighborhoods: [],
    fPriceMentionedAtTurn: null,
  };

  it('apenas se confirma la operación, pregunta el nombre ANTES de llamar a QualificationHandler (no lo apila con el teaser)', async () => {
    const result = await handler.handle(
      ctx('Comprar', { greetedAt: new Date('2026-07-28T11:45:53Z') }),
      filtersWithOperation,
    );

    expect(qualification.handle).not.toHaveBeenCalled();
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0]).toMatchObject({
      kind: 'text',
      text: expect.stringMatching(/nombre|gusto/i),
    });
    expect(result.nextState).toBe(ConversationState.QUALIFICATION);
    expect(result.markNameAsked).toBe(true);
    expect(result.filterUpdates).toEqual(filtersWithOperation);
  });

  it('si ya tenemos el nombre, no pregunta y pasa derecho a QualificationHandler', async () => {
    qualification.handle.mockResolvedValue({
      actions: [{ kind: 'text', text: 'ok' }],
      nextState: ConversationState.SEARCH_MATCH,
    });

    const result = await handler.handle(
      ctx(
        'Comprar',
        { greetedAt: new Date('2026-07-28T11:45:53Z'), name: 'Valentino' },
      ),
      filtersWithOperation,
    );

    expect(qualification.handle).toHaveBeenCalledTimes(1);
    expect(result.actions).toEqual([{ kind: 'text', text: 'ok' }]);
  });

  it('si ya se lo preguntamos antes (nameAskedAt seteado), no lo repite aunque todavía no tengamos el nombre', async () => {
    qualification.handle.mockResolvedValue({
      actions: [{ kind: 'text', text: 'ok' }],
      nextState: ConversationState.SEARCH_MATCH,
    });

    const result = await handler.handle(
      ctx('Comprar', {
        greetedAt: new Date('2026-07-28T11:45:53Z'),
        nameAskedAt: new Date('2026-07-20'),
      }),
      filtersWithOperation,
    );

    expect(qualification.handle).toHaveBeenCalledTimes(1);
    expect(result.actions).toEqual([{ kind: 'text', text: 'ok' }]);
  });

  it('cuando el primer mensaje ya trae operación, antepone el saludo y DESPUÉS pregunta el nombre (sin llamar a QualificationHandler)', async () => {
    const result = await handler.handle(
      ctx('hola quiero comprar en palermo', { greetedAt: null }),
      filtersWithOperation,
    );

    expect(qualification.handle).not.toHaveBeenCalled();
    expect(result.actions).toHaveLength(2);
    expect(result.actions[0].text).toContain('INMOAGENT');
    expect(result.actions[1]).toMatchObject({
      text: expect.stringMatching(/nombre|gusto/i),
    });
    expect(result.markGreeted).toBe(true);
    expect(result.markNameAsked).toBe(true);
  });

  it('reconoce "vi una propiedad puntual" en el saludo (references_seen_listing), antes de la pregunta de operación', async () => {
    const result = await handler.handle(
      ctx(
        'Hola, vi una propiedad en Palermo que me interesa',
        { greetedAt: null },
        { intent: 'references_seen_listing', neighborhoods: ['palermo'] },
      ),
      { ...filtersWithOperation, fOperation: null },
    );

    expect(result.actions[0].text).toContain(SEEN_LISTING_ACK);
    // El aviso de link/dirección va ANTES de la pregunta de comprar/alquilar.
    const ackIndex = result.actions[0].text.indexOf(SEEN_LISTING_ACK);
    const opIndex = result.actions[0].text.indexOf('comprar');
    expect(ackIndex).toBeGreaterThan(-1);
    expect(opIndex).toBeGreaterThan(ackIndex);
  });
});
