import { ConversationState } from '@prisma/client';
import { CommercialQualificationHandler } from './commercial-qualification.handler';
import { QualificationHandler } from './qualification.handler';
import { SchedulingHandler } from './scheduling.handler';
import { PrismaService } from '../../prisma/prisma.service';
import type { HandlerContext, LeadFilters } from '../conversation.types';

/**
 * Estado COMMERCIAL_QUALIFICATION (spec 09, T1.4): entre SEARCH_MATCH y
 * SCHEDULING. El LLM nunca decide qué preguntar ni cuándo parar — todo se
 * calcula acá en código a partir de `Lead.fOperation` y `Lead.qAskedFields`.
 */
describe('CommercialQualificationHandler', () => {
  const tenant = { id: 'tenant-1' } as HandlerContext['tenant'];
  const property = { id: 'prop-1', title: '2 amb en Caballito' };

  let scheduling: { enterScheduling: jest.Mock };
  let qualification: { handle: jest.Mock };
  let prisma: { property: { findUnique: jest.Mock } };
  let handler: CommercialQualificationHandler;

  beforeEach(() => {
    scheduling = {
      enterScheduling: jest.fn().mockResolvedValue({
        actions: [{ kind: 'text', text: 'link de agenda' }],
        nextState: ConversationState.HUMAN_HANDOFF,
      }),
    };
    qualification = { handle: jest.fn().mockResolvedValue({ actions: [], nextState: ConversationState.QUALIFICATION }) };
    prisma = {
      property: { findUnique: jest.fn().mockResolvedValue(property) },
    };
    handler = new CommercialQualificationHandler(
      scheduling as unknown as SchedulingHandler,
      qualification as unknown as QualificationHandler,
      prisma as unknown as PrismaService,
    );
  });

  function lead(overrides: Partial<HandlerContext['lead']> = {}): HandlerContext['lead'] {
    return {
      id: 'lead-1',
      fOperation: 'RENT',
      qGuarantee: null,
      qPaymentMethod: null,
      qTimeline: null,
      qHasPropertyToSell: null,
      qAskedFields: [],
      pendingPropertyId: null,
      turnCount: 5,
      ...overrides,
    } as unknown as HandlerContext['lead'];
  }

  function extraction(overrides: Partial<HandlerContext['extraction']> = {}): HandlerContext['extraction'] {
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
    } as unknown as HandlerContext['extraction'];
  }

  function ctx(
    leadData: HandlerContext['lead'],
    turnText: string,
    extractionData: HandlerContext['extraction'],
  ): HandlerContext {
    return {
      tenant,
      lead: leadData,
      turnText,
      extraction: extractionData,
      recentMessages: [],
    };
  }

  const filters = {} as LeadFilters;

  // AC-27/AC-28
  it('AC-28: al entrar con RENT, pregunta "guarantee" primero', async () => {
    const result = await handler.enter(
      ctx(lead(), 'me interesa esa', extraction()),
      property as never,
      filters,
    );

    expect(result.nextState).toBe(ConversationState.COMMERCIAL_QUALIFICATION);
    expect(result.actions[0]).toMatchObject({
      kind: 'text',
      text: expect.stringMatching(/garant/i),
    });
    expect(result.commercialUpdate?.qAskedFields).toEqual(['guarantee']);
    expect(result.commercialUpdate?.pendingPropertyId).toBe('prop-1');
  });

  it('AC-28: al entrar con SALE, pregunta "paymentMethod" primero', async () => {
    const result = await handler.enter(
      ctx(lead({ fOperation: 'SALE' }), 'me interesa esa', extraction()),
      property as never,
      filters,
    );

    expect(result.actions[0]).toMatchObject({
      text: expect.stringMatching(/contado|crédito/i),
    });
    expect(result.commercialUpdate?.qAskedFields).toEqual(['paymentMethod']);
  });

  it('AC-28: TEMP_RENT solo pregunta "timeline" (una sola pregunta)', async () => {
    const result = await handler.enter(
      ctx(lead({ fOperation: 'TEMP_RENT' }), 'me interesa esa', extraction()),
      property as never,
      filters,
    );

    expect(result.actions[0]).toMatchObject({
      text: expect.stringMatching(/mudarte|fecha/i),
    });
    expect(result.commercialUpdate?.qAskedFields).toEqual(['timeline']);
  });

  // AC-29
  it('AC-29: tras la 2da pregunta sin contestar, la 3ra respuesta pasa a SCHEDULING igual', async () => {
    const afterTwoAsked = lead({
      qAskedFields: ['guarantee', 'timeline'],
      pendingPropertyId: 'prop-1',
    });

    const result = await handler.handle(
      ctx(afterTwoAsked, 'y bueno, seguimos', extraction()),
      filters,
    );

    expect(scheduling.enterScheduling).toHaveBeenCalledTimes(1);
    expect(scheduling.enterScheduling).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: 'prop-1' }),
    );
    expect(result.commercialUpdate?.pendingPropertyId).toBeNull();
  });

  // AC-30
  it('AC-30: nunca vuelve a preguntar un campo ya preguntado', async () => {
    const afterGuaranteeAsked = lead({ qAskedFields: ['guarantee'] });

    const result = await handler.handle(
      ctx(afterGuaranteeAsked, 'no contesto la garantía', extraction()),
      filters,
    );

    expect(result.actions[0]).toMatchObject({
      text: expect.stringMatching(/mudarte|fecha/i),
    });
    expect(result.commercialUpdate?.qAskedFields).toEqual(['guarantee', 'timeline']);
  });

  it('si el lead ya tenía el valor (lo dijo antes sin que se lo preguntemos), salta esa pregunta', async () => {
    const alreadyHasGuarantee = lead({ qGuarantee: 'propietaria' });

    const result = await handler.enter(
      ctx(alreadyHasGuarantee, 'me interesa', extraction()),
      property as never,
      filters,
    );

    expect(result.actions[0]).toMatchObject({
      text: expect.stringMatching(/mudarte|fecha/i),
    });
  });

  it('si contesta la pregunta en el mismo turno, avanza a la siguiente (no se traba)', async () => {
    const afterGuaranteeAsked = lead({ qAskedFields: ['guarantee'] });

    const result = await handler.handle(
      ctx(
        afterGuaranteeAsked,
        'tengo garantía propietaria',
        extraction({ guarantee: 'propietaria' }),
      ),
      filters,
    );

    expect(result.commercialUpdate?.qGuarantee).toBe('propietaria');
    expect(result.actions[0]).toMatchObject({
      text: expect.stringMatching(/mudarte|fecha/i),
    });
  });

  it('con RENT y ambas preguntas ya contestadas, pasa directo a SCHEDULING', async () => {
    const fullyAnswered = lead({
      qGuarantee: 'propietaria',
      qTimeline: 'inmediato',
      qAskedFields: ['guarantee', 'timeline'],
      pendingPropertyId: 'prop-1',
    });

    const result = await handler.handle(
      ctx(fullyAnswered, 'listo', extraction()),
      filters,
    );

    expect(scheduling.enterScheduling).toHaveBeenCalledTimes(1);
    expect(result.nextState).toBe(ConversationState.HUMAN_HANDOFF);
  });

  // AC-31
  it('AC-31: si trae un filtro nuevo en vez de contestar, vuelve a QUALIFICATION', async () => {
    const askedGuarantee = lead({ qAskedFields: ['guarantee'] });

    await handler.handle(
      ctx(
        askedGuarantee,
        'en realidad mejor busco en Belgrano',
        extraction({ neighborhoods: ['belgrano'] }),
      ),
      filters,
    );

    expect(qualification.handle).toHaveBeenCalledTimes(1);
    expect(scheduling.enterScheduling).not.toHaveBeenCalled();
  });

  // AC-34
  it('AC-34: el link de agenda se dispara una sola vez (una sola llamada a enterScheduling)', async () => {
    const readyToSchedule = lead({
      qAskedFields: ['guarantee', 'timeline'],
      pendingPropertyId: 'prop-1',
    });

    await handler.handle(ctx(readyToSchedule, 'dale', extraction()), filters);

    expect(scheduling.enterScheduling).toHaveBeenCalledTimes(1);
  });

  it('sin propiedad puntual (pendingPropertyId null), igual pasa a SCHEDULING con property null', async () => {
    const noProperty = lead({
      qAskedFields: ['guarantee', 'timeline'],
      pendingPropertyId: null,
    });

    await handler.handle(ctx(noProperty, 'dale', extraction()), filters);

    expect(scheduling.enterScheduling).toHaveBeenCalledWith(
      expect.anything(),
      null,
    );
  });
});
