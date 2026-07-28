import { Injectable } from '@nestjs/common';
import { ConversationState, type Lead } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { PropertyWithPhotos } from '../../properties/property-search.service';
import { leadSeed } from '../copy-variants.util';
import { hasNewFilterData } from '../filters.util';
import { buildCommercialQuestion, type CommercialField } from '../templates';
import type {
  HandlerContext,
  HandlerResult,
  LeadFilters,
} from '../conversation.types';
import { QualificationHandler } from './qualification.handler';
import { SchedulingHandler } from './scheduling.handler';

const PROPERTY_INCLUDE = { photos: { orderBy: { position: 'asc' as const } } };

/** Máximo de preguntas comerciales por lead (spec 09, T1.4, AC-29): garantiza
 * que el estado no pueda loopear, sin importar cuántos turnos tarde el lead
 * en contestar. */
export const MAX_COMMERCIAL_QUESTIONS = 2;

/** Orden de preguntas por operación (spec 09, §4.2). RENT y TEMP_RENT
 * comparten "timeline" porque en ambas importa la fecha; TEMP_RENT no
 * pregunta garantía (no aplica a estadías cortas). */
const QUESTION_ORDER: Partial<Record<string, CommercialField[]>> = {
  RENT: ['guarantee', 'timeline'],
  SALE: ['paymentMethod', 'hasPropertyToSell'],
  TEMP_RENT: ['timeline'],
};

type CommercialLeadFields = Pick<
  Lead,
  'qGuarantee' | 'qPaymentMethod' | 'qTimeline' | 'qHasPropertyToSell'
>;

const FIELD_TO_LEAD_KEY: Record<CommercialField, keyof CommercialLeadFields> = {
  guarantee: 'qGuarantee',
  timeline: 'qTimeline',
  paymentMethod: 'qPaymentMethod',
  hasPropertyToSell: 'qHasPropertyToSell',
};

/**
 * Estado COMMERCIAL_QUALIFICATION (spec 09, T1.4): entre SEARCH_MATCH y
 * SCHEDULING. El lead ya confirmó interés en una ficha; antes de mandar el
 * link de agenda se le hacen hasta `MAX_COMMERCIAL_QUESTIONS` preguntas
 * (garantía/timeline para alquiler, contado-crédito/vende-algo-antes para
 * venta), siempre UNA por mensaje y nunca repetida (AC-30).
 *
 * El LLM nunca decide qué preguntar ni cuándo parar: ambas cosas las calcula
 * este handler en código a partir de `Lead.fOperation` y `Lead.qAskedFields`.
 * Los VALORES de las respuestas sí vienen de la extracción (T1.3) — ya
 * sanitizada a un conjunto cerrado — porque el lead puede contestar lo que se
 * le preguntó o adelantar otro dato espontáneamente; en ambos casos se
 * captura igual.
 */
@Injectable()
export class CommercialQualificationHandler {
  constructor(
    private readonly scheduling: SchedulingHandler,
    private readonly qualification: QualificationHandler,
    private readonly prisma: PrismaService,
  ) {}

  /** Entrada (spec 09, T1.4, AC-27): el lead acaba de confirmar interés en
   * `property` (o en ninguna en particular, si `property` es null). */
  async enter(
    ctx: HandlerContext,
    property: PropertyWithPhotos | null,
    filters: LeadFilters,
  ): Promise<HandlerResult> {
    const leadWithPending: Lead = {
      ...ctx.lead,
      pendingPropertyId: property?.id ?? null,
      qAskedFields: [],
    };
    return this.process({ ...ctx, lead: leadWithPending }, filters, {
      pendingPropertyId: property?.id ?? null,
    });
  }

  /** El lead ya estaba en COMMERCIAL_QUALIFICATION y escribió de nuevo. */
  async handle(
    ctx: HandlerContext,
    filters: LeadFilters,
  ): Promise<HandlerResult> {
    // AC-31: trajo un filtro nuevo (cambió de zona/presupuesto/ambientes) en
    // vez de contestar -> se prioriza el cambio, se vuelve a QUALIFICATION.
    if (hasNewFilterData(ctx.extraction)) {
      return this.qualification.handle(ctx, filters);
    }
    return this.process(ctx, filters, {});
  }

  private async process(
    ctx: HandlerContext,
    filters: LeadFilters,
    extraUpdate: { pendingPropertyId?: string | null },
  ): Promise<HandlerResult> {
    const lead = ctx.lead;
    const operation = lead.fOperation;

    // Fusiona lo que el lead haya contestado ESTE turno (puede ser la
    // respuesta a lo que se le preguntó, o un dato que adelantó solo).
    const answered: Partial<CommercialLeadFields> = {};
    if (ctx.extraction.guarantee !== null) {
      answered.qGuarantee = ctx.extraction.guarantee;
    }
    if (ctx.extraction.paymentMethod !== null) {
      answered.qPaymentMethod = ctx.extraction.paymentMethod;
    }
    if (ctx.extraction.timeline !== null) {
      answered.qTimeline = ctx.extraction.timeline;
    }
    if (ctx.extraction.hasPropertyToSell !== null) {
      answered.qHasPropertyToSell = ctx.extraction.hasPropertyToSell;
    }

    const mergedLead: CommercialLeadFields = {
      qGuarantee: answered.qGuarantee ?? lead.qGuarantee,
      qPaymentMethod: answered.qPaymentMethod ?? lead.qPaymentMethod,
      qTimeline: answered.qTimeline ?? lead.qTimeline,
      qHasPropertyToSell: answered.qHasPropertyToSell ?? lead.qHasPropertyToSell,
    };

    const nextField = this.nextFieldToAsk(operation, mergedLead, lead.qAskedFields);

    if (!nextField) {
      const property = await this.resolvePendingProperty(
        extraUpdate.pendingPropertyId !== undefined
          ? extraUpdate.pendingPropertyId
          : lead.pendingPropertyId,
      );
      const result = await this.scheduling.enterScheduling(ctx, property);
      return {
        ...result,
        commercialUpdate: {
          ...answered,
          pendingPropertyId: null,
        },
      };
    }

    const askedFields = [...lead.qAskedFields, nextField];

    return {
      actions: [
        {
          kind: 'text',
          text: buildCommercialQuestion(nextField, leadSeed(lead)),
        },
      ],
      nextState: ConversationState.COMMERCIAL_QUALIFICATION,
      filterUpdates: filters,
      commercialUpdate: {
        ...answered,
        qAskedFields: askedFields,
        ...extraUpdate,
      },
    };
  }

  /** ¿Qué campo falta preguntar? `null` = ya está todo (contestado o
   * agotado el cupo) y corresponde pasar a SCHEDULING. */
  private nextFieldToAsk(
    operation: Lead['fOperation'],
    mergedLead: CommercialLeadFields,
    askedFields: string[],
  ): CommercialField | null {
    if (askedFields.length >= MAX_COMMERCIAL_QUESTIONS) return null;
    const order = (operation && QUESTION_ORDER[operation]) || [];
    for (const field of order) {
      if (askedFields.includes(field)) continue;
      if (mergedLead[FIELD_TO_LEAD_KEY[field]] !== null) continue;
      return field;
    }
    return null;
  }

  private async resolvePendingProperty(
    propertyId: string | null | undefined,
  ): Promise<PropertyWithPhotos | null> {
    if (!propertyId) return null;
    return this.prisma.property.findUnique({
      where: { id: propertyId },
      include: PROPERTY_INCLUDE,
    });
  }
}
