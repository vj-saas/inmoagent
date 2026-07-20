import { Injectable } from '@nestjs/common';
import { ConversationState } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { PropertyWithPhotos } from '../../properties/property-search.service';
import type {
  HandlerContext,
  HandlerResult,
  LeadFilters,
} from '../conversation.types';
import { confirmsPropertyChoice, hasNewFilterData } from '../filters.util';
import { QualificationHandler } from './qualification.handler';
import { SchedulingHandler } from './scheduling.handler';

const PROPERTY_INCLUDE = { photos: { orderBy: { position: 'asc' as const } } };

@Injectable()
export class SearchMatchHandler {
  constructor(
    private readonly qualification: QualificationHandler,
    private readonly scheduling: SchedulingHandler,
    private readonly prisma: PrismaService,
  ) {}

  async handle(
    ctx: HandlerContext,
    filters: LeadFilters,
  ): Promise<HandlerResult> {
    const { extraction, lead } = ctx;

    // Guardrail §1 del QA de personas: el LLM a veces alucina un
    // `interestedPropertyIndex` en mensajes que no eligen nada ("dale
    // mostrame", "2 amb estaria joya"). Agendar una visita silencia al bot
    // (HUMAN_HANDOFF), así que antes de hacerlo exigimos que el TEXTO del lead
    // realmente refiera a una ficha (número/ordinal/deíctico/verbo de interés).
    const choiceConfirmed =
      extraction.interestedPropertyIndex !== null &&
      confirmsPropertyChoice(ctx.turnText);

    if (extraction.interestedPropertyIndex !== null && !choiceConfirmed) {
      if (hasNewFilterData(extraction)) {
        // Trajo datos nuevos: seguimos calificando/buscando normalmente.
        return this.qualification.handle(ctx, filters);
      }
      return {
        actions: [
          {
            kind: 'text',
            text: '¿Te interesó alguna de las que te mostré? Decime el número y te coordino una visita 🙂',
          },
        ],
        nextState: ConversationState.SEARCH_MATCH,
      };
    }

    if (extraction.interestedPropertyIndex !== null) {
      const property = await this.resolveChosenProperty(
        lead.lastSearchIds,
        extraction.interestedPropertyIndex,
      );
      if (property) {
        return this.scheduling.enterScheduling(ctx, property);
      }
      return {
        actions: [
          {
            kind: 'text',
            text: 'No encontré esa opción entre las que te mostré recién, ¿me confirmás cuál te interesa?',
          },
        ],
        nextState: ConversationState.SEARCH_MATCH,
      };
    }

    // Cambio de criterios (o cualquier info nueva) vuelve a QUALIFICATION, actualizando filtros
    // sin arrancar de cero (docs/03-CONVERSACION.md §SEARCH_MATCH).
    return this.qualification.handle(ctx, filters);
  }

  private async resolveChosenProperty(
    lastSearchIds: string[],
    index: number,
  ): Promise<PropertyWithPhotos | null> {
    const propertyId = lastSearchIds[index - 1];
    if (!propertyId) {
      return null;
    }
    return this.prisma.property.findUnique({
      where: { id: propertyId },
      include: PROPERTY_INCLUDE,
    });
  }
}
