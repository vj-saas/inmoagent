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
import { SafeReplyService } from '../safe-reply.service';
import { QualificationHandler } from './qualification.handler';
import { SchedulingHandler } from './scheduling.handler';

const PROPERTY_INCLUDE = { photos: { orderBy: { position: 'asc' as const } } };

/** ¿El turno trae una pregunta sin responder junto con el interés? No agendamos
 * silenciando al bot (HUMAN_HANDOFF) sin contestarla antes (QA 2026-07-27:
 * "me interesa el segundo, de cuanto son las expensas?" saltaba directo a
 * agendar visita, ignorando la pregunta). Chequeo simple y determinístico: un
 * signo de pregunta en el texto, o el LLM clasificó el turno como ask_question.
 */
function hasUnansweredQuestion(ctx: HandlerContext): boolean {
  return ctx.turnText.includes('?') || ctx.extraction.intent === 'ask_question';
}

function describePropertyForLlm(property: PropertyWithPhotos): string {
  const fields: Array<[string, string | null]> = [
    ['título', property.title],
    ['operación', property.operation],
    ['tipo', property.propertyType],
    ['precio', `${property.currency} ${Number(property.price).toLocaleString('es-AR')}`],
    [
      'expensas',
      property.expenses != null
        ? `ARS ${Number(property.expenses).toLocaleString('es-AR')}`
        : 'no informadas',
    ],
    ['barrio', property.neighborhood],
    ['ambientes', property.rooms != null ? String(property.rooms) : null],
    ['dormitorios', property.bedrooms != null ? String(property.bedrooms) : null],
    ['baños', property.bathrooms != null ? String(property.bathrooms) : null],
    ['superficie', property.areaM2 != null ? `${property.areaM2} m²` : null],
    ['cochera', property.garage ? 'sí' : 'no'],
    ['acepta mascotas', property.petsAllowed ? 'sí' : 'no'],
    ['características', property.features.length > 0 ? property.features.join(', ') : null],
    ['descripción', property.description],
  ];
  return fields
    .filter(([, value]) => value !== null)
    .map(([label, value]) => `${label}: ${value}`)
    .join('\n');
}

@Injectable()
export class SearchMatchHandler {
  constructor(
    private readonly qualification: QualificationHandler,
    private readonly scheduling: SchedulingHandler,
    private readonly prisma: PrismaService,
    private readonly safeReply: SafeReplyService,
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
        if (hasUnansweredQuestion(ctx)) {
          // Contestamos la pregunta con los datos reales de ESA propiedad
          // (nunca inventados) y recién ahí ofrecemos coordinar la visita, en
          // vez de agendar de una y silenciar al bot sin haber respondido.
          const reply = await this.safeReply.compose(
            {
              tenant: ctx.tenant,
              lead,
              recentMessages: ctx.recentMessages,
              instruction: `El lead mostró interés en esta propiedad y además preguntó algo sobre ella en el mismo mensaje ("${ctx.turnText}"). Respondé su pregunta usando SOLO estos datos reales de la propiedad (si el dato no está, decí honestamente que no lo tenés a mano y que lo confirma el asesor en la visita):\n${describePropertyForLlm(property)}\n\nDespués de responder, preguntale si querés que le coordines la visita.`,
            },
            '¡Buena pregunta! Eso te lo confirma el asesor en la visita. ¿Querés que te coordine para verla?',
          );
          return {
            actions: [{ kind: 'text', text: reply }],
            nextState: ConversationState.SEARCH_MATCH,
          };
        }
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
