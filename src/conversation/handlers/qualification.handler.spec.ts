import { ConversationState } from '@prisma/client';
import { QualificationHandler } from './qualification.handler';
import { PropertySearchService } from '../../properties/property-search.service';
import { SafeReplyService } from '../safe-reply.service';
import type { HandlerContext, LeadFilters } from '../conversation.types';

/**
 * QA 2026-07-27 (sim-personas "17-zona-fuera-cobertura"): un lead que insiste
 * en una zona que ya rechazamos (sin nombrarla otra vez, ej. "tiene que ser
 * ahí") quedaba en loop — `askMissingFilter` caía al fallback genérico de
 * `SafeReplyService.compose`, que improvisaba una pregunta confusa
 * mezclando el nombre de la zona rechazada. Este spec cubre el corte
 * determinístico agregado: si ya hay una oferta de zonas alternativas
 * pendiente (`fOfferedNeighborhoods`) y la zona sigue faltando, respondemos
 * con un mensaje honesto fijo en vez de llamar al LLM.
 */
describe('QualificationHandler — zona insistida tras oferta rechazada', () => {
  const tenant = { id: 'tenant-1' } as HandlerContext['tenant'];
  const lead = { id: 'lead-1' } as HandlerContext['lead'];

  let propertySearch: {
    zonesWithStock: jest.Mock;
    topStockZones: jest.Mock;
    teaserSearch: jest.Mock;
    searchAndRecordForLead: jest.Mock;
  };
  let safeReply: { compose: jest.Mock };
  let handler: QualificationHandler;

  beforeEach(() => {
    propertySearch = {
      zonesWithStock: jest.fn(),
      topStockZones: jest.fn(),
      teaserSearch: jest.fn(),
      searchAndRecordForLead: jest.fn(),
    };
    safeReply = { compose: jest.fn() };
    handler = new QualificationHandler(
      propertySearch as unknown as PropertySearchService,
      safeReply as unknown as SafeReplyService,
    );
  });

  function ctx(turnText: string): HandlerContext {
    return {
      tenant,
      lead,
      turnText,
      extraction: {
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
      },
      recentMessages: [],
    } as HandlerContext;
  }

  function filters(overrides: Partial<LeadFilters> = {}): LeadFilters {
    return {
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
      ...overrides,
    };
  }

  it('con oferta pendiente y zona todavía faltante, responde honesto sin llamar al LLM', async () => {
    const result = await handler.handle(
      ctx('no me sirve otra zona, tiene que ser ahi porque trabajo cerca'),
      filters({ fOfferedNeighborhoods: ['palermo', 'caballito'] }),
    );

    expect(safeReply.compose).not.toHaveBeenCalled();
    expect(result.nextState).toBe(ConversationState.QUALIFICATION);
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0]).toMatchObject({
      kind: 'text',
      text: expect.stringContaining('*Palermo* o *Caballito*'),
    });
    expect(result.actions[0]).toMatchObject({
      text: expect.not.stringMatching(/qué (zona|barrio)/i),
    });
  });

  it('sin oferta pendiente, sigue cayendo al fallback normal (LLM) — no regresión', async () => {
    safeReply.compose.mockResolvedValue('¿Por qué zona te gustaría buscar?');

    const result = await handler.handle(
      ctx('hola'),
      filters({ fOfferedNeighborhoods: [] }),
    );

    expect(safeReply.compose).toHaveBeenCalledTimes(1);
    expect(result.actions[0]).toMatchObject({
      kind: 'text',
      text: '¿Por qué zona te gustaría buscar?',
    });
  });
});

/**
 * QA 2026-07-27 (WhatsApp real): tras mostrar 2 opciones en Caballito (2amb y
 * 3amb), el lead preguntó "monoambiente hay?" — no había, así que la búsqueda
 * relajó ambientes y el más cercano resultó ser (por casualidad) el mismo par
 * ya mostrado. `sameAsBefore` solo comparaba las fichas resultantes, así que
 * disparó el genérico "ya te mostré todo" en vez del mensaje honesto de
 * relajación ("no tengo monoambiente, esto es lo más parecido") — el lead
 * nunca se enteró de que no había monoambientes.
 */
describe('QualificationHandler.triggerSearch — relajación vs. "mismas fichas"', () => {
  const tenant = { id: 'tenant-1' } as HandlerContext['tenant'];
  const property2amb = { id: 'prop-2amb' };
  const property3amb = { id: 'prop-3amb' };

  let propertySearch: {
    zonesWithStock: jest.Mock;
    topStockZones: jest.Mock;
    teaserSearch: jest.Mock;
    searchAndRecordForLead: jest.Mock;
  };
  let safeReply: { compose: jest.Mock };
  let handler: QualificationHandler;

  beforeEach(() => {
    propertySearch = {
      zonesWithStock: jest.fn().mockResolvedValue(['caballito']),
      topStockZones: jest.fn(),
      teaserSearch: jest.fn(),
      searchAndRecordForLead: jest.fn(),
    };
    safeReply = { compose: jest.fn() };
    handler = new QualificationHandler(
      propertySearch as unknown as PropertySearchService,
      safeReply as unknown as SafeReplyService,
    );
  });

  function ctx(turnText: string, minRooms: number | null): HandlerContext {
    return {
      tenant,
      lead: {
        id: 'lead-1',
        state: ConversationState.SEARCH_MATCH,
        lastSearchIds: ['prop-2amb', 'prop-3amb'],
        turnCount: 3,
      },
      turnText,
      extraction: {
        intent: 'ask_question',
        operation: null,
        neighborhoods: [],
        maxPrice: null,
        currency: null,
        minRooms,
        wantsGarage: null,
        wantsPetsAllowed: null,
        roomsInferred: false,
        priceFlexible: false,
        extraRequirements: null,
        interestedPropertyIndex: null,
      },
      recentMessages: [],
    } as unknown as HandlerContext;
  }

  function filters(overrides: Partial<LeadFilters> = {}): LeadFilters {
    return {
      fOperation: 'RENT' as LeadFilters['fOperation'],
      fNeighborhoods: ['caballito'],
      fMaxPrice: null,
      fCurrency: null,
      fMinRooms: null,
      fGarage: null,
      fPetsAllowed: null,
      fNotes: null,
      fOfferedNeighborhoods: [],
      fPriceMentionedAtTurn: null,
      ...overrides,
    };
  }

  it('si hubo que relajar (no hay monoambiente) muestra el mensaje honesto, aunque las fichas coincidan con las de antes', async () => {
    propertySearch.searchAndRecordForLead.mockResolvedValue({
      properties: [property2amb, property3amb],
      relaxed: 'rooms',
    });

    const result = await handler.handle(
      ctx('monoambiente hay?', 1),
      filters({ fMinRooms: 1 }),
    );

    expect(result.actions[0]).toMatchObject({
      kind: 'text',
      text: expect.stringContaining('no tengo nada con esos ambientes'),
    });
    expect(result.actions[0]).not.toMatchObject({
      text: expect.stringContaining('todas las opciones que tengo hoy'),
    });
  });

  it('"mostrame" sin cambiar nada (sin relajar) sí muestra el genérico "ya te mostré todo" — no regresión', async () => {
    propertySearch.searchAndRecordForLead.mockResolvedValue({
      properties: [property2amb, property3amb],
      relaxed: null,
    });

    const result = await handler.handle(
      ctx('mostrame de nuevo', null),
      filters({ fMinRooms: 2 }),
    );

    expect(result.actions[0]).toMatchObject({
      kind: 'text',
      // Copy variado (spec 09, T2.2): las 3 variantes coinciden en decir que
      // ya se mostró TODO el stock disponible con esos filtros.
      text: expect.stringMatching(/todo|todas/i),
    });
  });
});

/**
 * Eco de comprensión (spec 09, T2.5): antes de mostrar las fichas de la
 * PRIMERA búsqueda completa de un lead, se resume en una línea lo que el
 * sistema entendió — armado 100% de los filtros persistidos (AC-13), nunca
 * del LLM. Solo la primera vez (AC-12): si el lead ya había llegado antes a
 * SEARCH_MATCH, no se repite en cada búsqueda posterior.
 */
describe('QualificationHandler — eco de comprensión (T2.5)', () => {
  const tenant = { id: 'tenant-1' } as HandlerContext['tenant'];
  const property1 = { id: 'prop-1' };

  let propertySearch: {
    zonesWithStock: jest.Mock;
    topStockZones: jest.Mock;
    teaserSearch: jest.Mock;
    searchAndRecordForLead: jest.Mock;
  };
  let safeReply: { compose: jest.Mock };
  let handler: QualificationHandler;

  beforeEach(() => {
    propertySearch = {
      zonesWithStock: jest.fn().mockResolvedValue(['caballito']),
      topStockZones: jest.fn(),
      teaserSearch: jest.fn(),
      searchAndRecordForLead: jest.fn().mockResolvedValue({
        properties: [property1],
        relaxed: null,
      }),
    };
    safeReply = { compose: jest.fn() };
    handler = new QualificationHandler(
      propertySearch as unknown as PropertySearchService,
      safeReply as unknown as SafeReplyService,
    );
  });

  function ctx(state: ConversationState): HandlerContext {
    return {
      tenant,
      lead: {
        id: 'lead-1',
        state,
        lastSearchIds: [],
        turnCount: 4,
      },
      turnText: '2 ambientes, hasta 600 mil',
      extraction: {
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
      },
      recentMessages: [],
    } as unknown as HandlerContext;
  }

  const filters: LeadFilters = {
    fOperation: 'RENT' as LeadFilters['fOperation'],
    fNeighborhoods: ['caballito'],
    fMaxPrice: 600000,
    fCurrency: 'ARS',
    fMinRooms: 2,
    fGarage: null,
    fPetsAllowed: null,
    fNotes: null,
    fOfferedNeighborhoods: [],
    fPriceMentionedAtTurn: 4,
  };

  it('AC-12: primera búsqueda completa (el lead nunca estuvo en SEARCH_MATCH) arranca con el eco', async () => {
    const result = await handler.handle(
      ctx(ConversationState.QUALIFICATION),
      filters,
    );

    expect(result.actions[0]).toMatchObject({
      kind: 'text',
      text: expect.stringContaining('Entonces buscamos'),
    });
  });

  it('AC-13: el eco se arma con los filtros persistidos (operación, zona, precio, ambientes)', async () => {
    const result = await handler.handle(
      ctx(ConversationState.QUALIFICATION),
      filters,
    );
    const echoText = (result.actions[0] as { text: string }).text;

    expect(echoText).toContain('alquiler');
    expect(echoText).toContain('Caballito');
    expect(echoText).toContain('600.000');
    expect(echoText).toContain('2+ amb');
  });

  it('una búsqueda posterior (el lead ya había estado en SEARCH_MATCH) NO repite el eco', async () => {
    const result = await handler.handle(
      ctx(ConversationState.SEARCH_MATCH),
      filters,
    );

    expect(result.actions[0]).not.toMatchObject({
      text: expect.stringContaining('Entonces buscamos'),
    });
  });

  // spec 09, T3.2: la ficha se manda con los filtros vigentes adjuntos, para
  // que formatPropertyCaption pueda resaltar por qué encaja (match reasoning).
  it('T3.2: la acción "property" lleva los filtros vigentes adjuntos', async () => {
    const result = await handler.handle(
      ctx(ConversationState.QUALIFICATION),
      filters,
    );

    const propertyAction = result.actions.find((a) => a.kind === 'property');
    expect(propertyAction).toMatchObject({ filters });
  });
});

/**
 * Pedido de nombre (spec 09, T1.1): se pregunta una sola vez, recién después
 * de mostrar valor real (teaser o búsqueda completa), y nunca si ya lo
 * tenemos o ya se lo preguntamos antes (AC-17).
 */
describe('QualificationHandler — pedido de nombre (T1.1)', () => {
  const tenant = { id: 'tenant-1' } as HandlerContext['tenant'];
  const property1 = { id: 'prop-1' };

  let propertySearch: {
    zonesWithStock: jest.Mock;
    topStockZones: jest.Mock;
    teaserSearch: jest.Mock;
    searchAndRecordForLead: jest.Mock;
  };
  let safeReply: { compose: jest.Mock };
  let handler: QualificationHandler;

  beforeEach(() => {
    propertySearch = {
      zonesWithStock: jest.fn().mockResolvedValue(['caballito']),
      topStockZones: jest.fn(),
      teaserSearch: jest.fn().mockResolvedValue({ properties: [property1] }),
      searchAndRecordForLead: jest.fn().mockResolvedValue({
        properties: [property1],
        relaxed: null,
      }),
    };
    safeReply = { compose: jest.fn() };
    handler = new QualificationHandler(
      propertySearch as unknown as PropertySearchService,
      safeReply as unknown as SafeReplyService,
    );
  });

  function ctx(
    leadOverrides: Partial<{ name: string | null; nameAskedAt: Date | null }>,
  ): HandlerContext {
    return {
      tenant,
      lead: {
        id: 'lead-1',
        state: ConversationState.QUALIFICATION,
        lastSearchIds: [],
        turnCount: 2,
        name: null,
        nameAskedAt: null,
        ...leadOverrides,
      },
      turnText: 'busco en caballito para alquilar',
      extraction: {
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
      },
      recentMessages: [],
    } as unknown as HandlerContext;
  }

  // Teaser: operación + zona, sin ambientes/precio -> triggerTeaser.
  const teaserFilters: LeadFilters = {
    fOperation: 'RENT' as LeadFilters['fOperation'],
    fNeighborhoods: ['caballito'],
    fMaxPrice: null,
    fCurrency: null,
    fMinRooms: null,
    fGarage: null,
    fPetsAllowed: null,
    fNotes: null,
    fOfferedNeighborhoods: [],
    fPriceMentionedAtTurn: null,
  };

  it('AC-17: sin nombre y sin haberlo preguntado antes, el teaser termina con el pedido de nombre', async () => {
    const result = await handler.handle(ctx({}), teaserFilters);

    const lastAction = result.actions[result.actions.length - 1];
    expect(lastAction).toMatchObject({
      kind: 'text',
      text: expect.stringMatching(/nombre|gusto/i),
    });
    expect(result.markNameAsked).toBe(true);
  });

  it('AC-17: si ya tenemos el nombre, NO se pregunta', async () => {
    const result = await handler.handle(ctx({ name: 'Martín' }), teaserFilters);

    const lastAction = result.actions[result.actions.length - 1];
    expect(lastAction).not.toMatchObject({
      text: expect.stringMatching(/nombre|gusto/i),
    });
    expect(result.markNameAsked).toBe(false);
  });

  it('AC-17: si ya se lo preguntamos antes (nameAskedAt seteado), NO se vuelve a preguntar', async () => {
    const result = await handler.handle(
      ctx({ nameAskedAt: new Date('2026-07-20') }),
      teaserFilters,
    );

    const lastAction = result.actions[result.actions.length - 1];
    expect(lastAction).not.toMatchObject({
      text: expect.stringMatching(/nombre|gusto/i),
    });
    expect(result.markNameAsked).toBe(false);
  });

  it('AC-17: en una búsqueda completa (no teaser), también se pregunta el nombre al final', async () => {
    const fullFilters: LeadFilters = {
      ...teaserFilters,
      fMaxPrice: 500000,
      fCurrency: 'ARS',
      fMinRooms: 2,
    };
    const result = await handler.handle(ctx({}), fullFilters);

    const lastAction = result.actions[result.actions.length - 1];
    expect(lastAction).toMatchObject({
      text: expect.stringMatching(/nombre|gusto/i),
    });
    expect(result.markNameAsked).toBe(true);
  });
});

/**
 * Rescate cuando no hay stock ni relajando ningún criterio (spec 09, T3.3):
 * en vez de solo decir "no tengo nada", ofrece avisar cuando entre algo, y
 * pide el nombre si todavía no lo tenemos (AC-47). Si el lead acepta (sin
 * traer un filtro nuevo), setea qWantsStockAlert (AC-48). Nunca promete un
 * plazo (AC-49).
 */
describe('QualificationHandler — rescate sin stock (T3.3)', () => {
  const tenant = { id: 'tenant-1' } as HandlerContext['tenant'];

  let propertySearch: {
    zonesWithStock: jest.Mock;
    topStockZones: jest.Mock;
    teaserSearch: jest.Mock;
    searchAndRecordForLead: jest.Mock;
  };
  let safeReply: { compose: jest.Mock };
  let handler: QualificationHandler;

  beforeEach(() => {
    propertySearch = {
      zonesWithStock: jest.fn().mockResolvedValue(['caballito']),
      topStockZones: jest.fn(),
      teaserSearch: jest.fn(),
      searchAndRecordForLead: jest
        .fn()
        .mockResolvedValue({ properties: [], relaxed: null }),
    };
    safeReply = { compose: jest.fn() };
    handler = new QualificationHandler(
      propertySearch as unknown as PropertySearchService,
      safeReply as unknown as SafeReplyService,
    );
  });

  function ctx(
    turnText: string,
    leadOverrides: Partial<{
      name: string | null;
      nameAskedAt: Date | null;
      qWantsStockAlert: boolean;
    }> = {},
    extractionOverrides: Partial<HandlerContext['extraction']> = {},
  ): HandlerContext {
    return {
      tenant,
      lead: {
        id: 'lead-1',
        state: ConversationState.QUALIFICATION,
        lastSearchIds: [],
        turnCount: 3,
        name: null,
        nameAskedAt: null,
        qWantsStockAlert: false,
        ...leadOverrides,
      },
      turnText,
      extraction: {
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
        ...extractionOverrides,
      },
      recentMessages: [],
    } as unknown as HandlerContext;
  }

  const filters: LeadFilters = {
    fOperation: 'RENT' as LeadFilters['fOperation'],
    fNeighborhoods: ['caballito'],
    fMaxPrice: 500000,
    fCurrency: 'ARS',
    fMinRooms: 2,
    fGarage: null,
    fPetsAllowed: null,
    fNotes: null,
    fOfferedNeighborhoods: [],
    fPriceMentionedAtTurn: null,
  };

  it('AC-47: sin stock ni relajando, ofrece avisar y pide el nombre (sin tenerlo)', async () => {
    const result = await handler.handle(ctx('hay algo en caballito?'), filters);

    const text = (result.actions[0] as { text: string }).text;
    expect(text).toMatch(/avise|aviso/i);
    expect(text).toMatch(/nombre/i);
  });

  it('AC-47: si ya tenemos el nombre, no lo vuelve a pedir en el ofrecimiento', async () => {
    const result = await handler.handle(
      ctx('hay algo en caballito?', { name: 'Martín' }),
      filters,
    );

    const text = (result.actions[0] as { text: string }).text;
    expect(text).toMatch(/avise|aviso/i);
    expect(text).not.toMatch(/contame tu nombre/i);
  });

  it('AC-48: el lead acepta (sin traer filtro nuevo) -> setea qWantsStockAlert', async () => {
    const result = await handler.handle(ctx('dale'), filters);

    expect(result.commercialUpdate?.qWantsStockAlert).toBe(true);
    const text = (result.actions[0] as { text: string }).text;
    expect(text).toMatch(/anotado|listo/i);
  });

  it('un "dale" que trae un filtro nuevo NO se toma como aceptación (es una búsqueda distinta)', async () => {
    const result = await handler.handle(
      ctx('dale, busco en Recoleta', {}, { neighborhoods: ['recoleta'] }),
      filters,
    );

    expect(result.commercialUpdate?.qWantsStockAlert).toBeUndefined();
  });

  it('ya había aceptado antes (qWantsStockAlert=true) -> no repite el ofrecimiento ni la confirmación', async () => {
    const result = await handler.handle(
      ctx('segis sin nada?', { qWantsStockAlert: true }),
      filters,
    );

    const text = (result.actions[0] as { text: string }).text;
    expect(text).not.toMatch(/te avise|anotado/i);
    expect(result.commercialUpdate?.qWantsStockAlert).toBeUndefined();
  });

  // AC-49
  it('AC-49: ninguna variante del ofrecimiento ni de la confirmación promete un plazo', async () => {
    const offer = await handler.handle(ctx('hay algo?'), filters);
    const offerText = (offer.actions[0] as { text: string }).text;
    expect(offerText).not.toMatch(/\d+\s*(d[ií]as?|horas?|semanas?)/i);

    const confirm = await handler.handle(ctx('dale'), filters);
    const confirmText = (confirm.actions[0] as { text: string }).text;
    expect(confirmText).not.toMatch(/\d+\s*(d[ií]as?|horas?|semanas?)/i);
  });
});
