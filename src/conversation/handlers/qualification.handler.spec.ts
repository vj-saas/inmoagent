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
