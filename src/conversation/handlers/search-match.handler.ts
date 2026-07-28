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
import { CommercialQualificationHandler } from './commercial-qualification.handler';
import { QualificationHandler } from './qualification.handler';

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
    private readonly commercialQualification: CommercialQualificationHandler,
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
          return this.answerQuestionAboutProperty(ctx, property);
        }
        // spec 09, T1.4, AC-27: antes de agendar directo, pasa por
        // COMMERCIAL_QUALIFICATION (garantía/timeline o contado-crédito,
        // según la operación) — nunca se agenda a ciegas apenas confirma interés.
        return this.commercialQualification.enter(ctx, property, filters);
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

    // QA real (2026-07-28): "cuánto tiene de expensas?" sin decir "el 1"/"el
    // segundo" caía derecho a `qualification.handle`, que la ignoraba en
    // silencio y preguntaba el siguiente filtro (ambientes/presupuesto). Si
    // solo se mostró UNA propiedad (`lastSearchIds.length === 1`), no hay
    // ambigüedad sobre a cuál se refiere: la contestamos igual que en el caso
    // de arriba. Con más de una ficha mostrada seguimos sin poder adivinar a
    // cuál se refiere, así que cae al flujo normal (sin empeorar lo que ya
    // había).
    if (hasUnansweredQuestion(ctx) && lead.lastSearchIds.length === 1) {
      const property = await this.resolveChosenProperty(lead.lastSearchIds, 1);
      if (property) {
        return this.answerQuestionAboutProperty(ctx, property);
      }
    }

    // Cambio de criterios (o cualquier info nueva) vuelve a QUALIFICATION, actualizando filtros
    // sin arrancar de cero (docs/03-CONVERSACION.md §SEARCH_MATCH).
    return this.qualification.handle(ctx, filters);
  }

  private async answerQuestionAboutProperty(
    ctx: HandlerContext,
    property: PropertyWithPhotos,
  ): Promise<HandlerResult> {
    const reply = await this.safeReply.compose(
      {
        tenant: ctx.tenant,
        lead: ctx.lead,
        recentMessages: ctx.recentMessages,
        instruction: `El lead preguntó algo sobre esta propiedad ("${ctx.turnText}"). Respondé su pregunta usando SOLO estos datos reales de la propiedad (si el dato no está, decí honestamente que no lo tenés a mano y que lo confirma el asesor en la visita):\n${describePropertyForLlm(property)}\n\nDespués de responder, preguntale si querés que le coordines la visita.`,
      },
      '¡Buena pregunta! Eso te lo confirma el asesor en la visita. ¿Querés que te coordine para verla?',
    );
    return {
      actions: [{ kind: 'text', text: reply }],
      nextState: ConversationState.SEARCH_MATCH,
    };
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
