import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  ConversationState,
  type Lead,
  type Prisma,
  type Tenant,
} from '@prisma/client';
import type {
  ConversationMessage,
  LlmProvider,
} from '../llm/llm-provider.interface';
import { LLM_PROVIDER } from '../llm/llm-provider.interface';
import { MessagingService } from '../messaging/messaging.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantsService } from '../tenants/tenants.service';
import type {
  HandlerContext,
  HandlerResult,
  LeadFilters,
  OutgoingAction,
} from './conversation.types';
import {
  acceptsZoneSuggestion,
  currentFiltersFrom,
  delegatesZoneChoice,
  hasNewFilterData,
  mergeFilters,
  normalizeKeycapDigits,
} from './filters.util';
import { hasBuyingSignal } from './buying-signals.util';
import { leadSeed } from './copy-variants.util';
import { applyFormality } from './formality.util';
import { calculateLeadScore } from './lead-score.util';
import { CommercialQualificationHandler } from './handlers/commercial-qualification.handler';
import { GreetingHandler } from './handlers/greeting.handler';
import { QualificationHandler } from './handlers/qualification.handler';
import { SchedulingHandler } from './handlers/scheduling.handler';
import { SearchMatchHandler } from './handlers/search-match.handler';
import { GuardrailsService } from './guardrails/guardrails.service';
import type { GuardrailAction } from './guardrails/guardrails.types';
import { LeadAlertService } from './lead-alert.service';
import { OutputValidatorService } from './output-validator.service';
import { resolveReleaseState } from './release-state.util';
import { SafeReplyService } from './safe-reply.service';
import {
  buildBuyingSignalFallback,
  buildHandoffFarewell,
  buildOffTopicRedirectFallback,
  buildReformulateRequest,
  formatPropertyCaption,
  HANDOFF_TIMEOUT_APOLOGY,
  OPT_OUT_CONFIRMATION,
} from './templates';

const RECENT_MESSAGES_LIMIT = 12;

interface GuardrailOutcome {
  stop: boolean;
  replies: string[];
  leadUpdate: Prisma.LeadUpdateInput;
}

@Injectable()
export class ConversationEngine {
  private readonly logger = new Logger(ConversationEngine.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenants: TenantsService,
    private readonly messaging: MessagingService,
    private readonly guardrails: GuardrailsService,
    @Inject(LLM_PROVIDER) private readonly llm: LlmProvider,
    private readonly safeReply: SafeReplyService,
    private readonly outputValidator: OutputValidatorService,
    private readonly leadAlert: LeadAlertService,
    private readonly greeting: GreetingHandler,
    private readonly qualification: QualificationHandler,
    private readonly searchMatch: SearchMatchHandler,
    private readonly commercialQualification: CommercialQualificationHandler,
    private readonly scheduling: SchedulingHandler,
  ) {}

  async handleTurn(
    tenantId: string,
    leadId: string,
    rawTurnText: string,
  ): Promise<void> {
    const turnText = normalizeKeycapDigits(rawTurnText);
    const [tenant, lead] = await Promise.all([
      this.tenants.findById(tenantId),
      this.prisma.lead.findUnique({ where: { id: leadId } }),
    ]);
    if (!tenant || !lead) {
      this.logger.error(
        { tenantId, leadId },
        'Tenant o lead no encontrado, se descarta el turno',
      );
      return;
    }

    const guardrailAction = this.guardrails.evaluate(lead, turnText);
    const guardrailOutcome = this.resolveGuardrail(
      tenant,
      lead,
      guardrailAction,
    );

    if (guardrailAction.type === 'handoff') {
      // Handoff explícito recién iniciado (no un re-pedido sobre un lead ya en HUMAN_HANDOFF).
      await this.leadAlert.notify(tenant, lead, null);
    }

    if (guardrailOutcome.stop) {
      await this.sendTexts(tenant, lead, guardrailOutcome.replies);
      if (Object.keys(guardrailOutcome.leadUpdate).length > 0) {
        await this.prisma.lead.update({
          where: { id: lead.id },
          data: guardrailOutcome.leadUpdate,
        });
      }
      return;
    }

    const effectiveLead: Lead = {
      ...lead,
      ...(guardrailOutcome.leadUpdate as Partial<Lead>),
    };
    const recentMessages = await this.loadRecentMessages(tenant.id, lead.id);
    // Cuenta turnos (no tiempo real) para poder detectar un fMaxPrice/fCurrency
    // que quedó pegado de hace muchos turnos (ver filters.util.ts#isPriceStale).
    const turnCount = (effectiveLead.turnCount ?? 0) + 1;

    const extraction = await this.llm.extractIntent({
      tenant,
      lead: effectiveLead,
      turnText,
      recentMessages,
    });
    if (!extraction) {
      await this.sendTexts(tenant, effectiveLead, [
        ...guardrailOutcome.replies,
        buildReformulateRequest(leadSeed({ id: lead.id, turnCount })),
      ]);
      await this.prisma.lead.update({
        where: { id: lead.id },
        data: {
          ...guardrailOutcome.leadUpdate,
          lastMessageAt: new Date(),
          turnCount,
        },
      });
      return;
    }

    const ctx: HandlerContext = {
      tenant,
      lead: { ...effectiveLead, turnCount },
      turnText,
      extraction,
      recentMessages,
    };
    let filters = mergeFilters(currentFiltersFrom(effectiveLead), extraction);
    // Solo se refresca cuando el lead REALMENTE dijo precio o moneda en este
    // turno; si no dijo nada, se deja como estaba (así se puede medir cuánto
    // hace que no lo reafirma).
    if (extraction.maxPrice !== null || extraction.currency !== null) {
      filters = { ...filters, fPriceMentionedAtTurn: turnCount };
    }
    // §4: si en el turno anterior le sugerimos zonas aledañas (desde CUALQUIER
    // estado: puede pasar incluso antes de saber operación, en GREETING) y
    // ahora acepta sin nombrarla explícitamente ("dale", "sí", "mostrame"),
    // tomamos las sugeridas como su zona de búsqueda.
    if (
      filters.fOfferedNeighborhoods.length > 0 &&
      filters.fNeighborhoods.length === 0 &&
      acceptsZoneSuggestion(turnText)
    ) {
      filters = {
        ...filters,
        fNeighborhoods: filters.fOfferedNeighborhoods,
        fOfferedNeighborhoods: [],
      };
    }

    const result = await this.resolveResult(
      effectiveLead,
      ctx,
      filters,
      recentMessages,
    );

    // El handler puede haber persistido cambios directo en DB (ej: lastSearchIds vía
    // PropertySearchService), así que releemos antes de validar/enviar en vez de confiar
    // en el snapshot en memoria de antes de despachar.
    const freshLead = await this.prisma.lead.findUniqueOrThrow({
      where: { id: effectiveLead.id },
    });

    await this.sendActions(tenant, freshLead, [
      ...guardrailOutcome.replies.map((text): OutgoingAction => ({
        kind: 'text',
        text,
      })),
      ...result.actions,
    ]);
    await this.persistLeadUpdate(freshLead, result, turnCount, extraction.name);
  }

  private async resolveResult(
    lead: Lead,
    ctx: HandlerContext,
    filters: LeadFilters,
    recentMessages: ConversationMessage[],
  ): Promise<HandlerResult> {
    // "Me da igual el barrio, vos qué me recomendás" suele venir clasificado
    // como ask_question/off_topic sin datos nuevos: NO es un desvío de tema,
    // es una delegación que el QualificationHandler sabe resolver ofreciendo
    // zonas concretas (QA personas §6).
    const delegatesZone =
      filters.fNeighborhoods.length === 0 && delegatesZoneChoice(ctx.turnText);

    // Señales de compra (spec 09, T3.1, H4): el LLM clasifica preguntas de
    // pago/descuento/reserva como `off_topic` ("me hacen descuento si pago
    // contado?" → "yo sólo puedo ayudarte con la búsqueda..."). Se detecta
    // por regex, ANTES de mirar `intent`, así nunca cae en el redirect
    // genérico de off-topic (AC-40). Se responde sin prometer nada (AC-41) y
    // se alerta al asesor (AC-42) — es la señal de compra más fuerte que hay.
    if (hasBuyingSignal(ctx.turnText)) {
      const reply = await this.safeReply.compose(
        {
          tenant: ctx.tenant,
          lead,
          recentMessages,
          instruction: `El lead hizo una pregunta o comentario relacionado a precio, forma de pago, descuento, seña o negociación ("${ctx.turnText}"). Respondé con calidez que eso te lo confirma el asesor humano directamente. NUNCA prometas descuentos, precios ni condiciones que no estén en los datos (regla del sistema). Si corresponde, invitalo a seguir viendo opciones.`,
        },
        buildBuyingSignalFallback(leadSeed(ctx.lead)),
      );
      await this.leadAlert.notify(ctx.tenant, lead, null);
      return {
        actions: [{ kind: 'text', text: reply }],
        nextState: lead.state,
        commercialUpdate: { qBuyingSignalAt: new Date() },
      };
    }

    const isRedirectable =
      !delegatesZone &&
      lead.state !== ConversationState.GREETING &&
      (ctx.extraction.intent === 'off_topic' ||
        (ctx.extraction.intent === 'ask_question' &&
          !hasNewFilterData(ctx.extraction)));

    if (isRedirectable) {
      const reply = await this.safeReply.compose(
        {
          tenant: ctx.tenant,
          lead,
          recentMessages,
          instruction: `El lead escribió algo que no tiene que ver con la búsqueda de propiedades ("${ctx.turnText}"). Respondé con simpatía, sin opinar del tema, y retomá la conversación invitándolo a seguir con la búsqueda.`,
        },
        buildOffTopicRedirectFallback(leadSeed(ctx.lead)),
      );
      return {
        actions: [{ kind: 'text', text: reply }],
        nextState: lead.state,
      };
    }

    switch (lead.state) {
      case ConversationState.GREETING:
        return this.greeting.handle(ctx, filters);
      case ConversationState.QUALIFICATION:
        return this.qualification.handle(ctx, filters);
      case ConversationState.SEARCH_MATCH:
        return this.searchMatch.handle(ctx, filters);
      case ConversationState.COMMERCIAL_QUALIFICATION:
        return this.commercialQualification.handle(ctx, filters);
      case ConversationState.SCHEDULING:
        return this.scheduling.handle(ctx);
      default:
        // HUMAN_HANDOFF/OPTED_OUT nunca deberían llegar acá: los guardrails los interceptan antes.
        this.logger.warn(
          { state: lead.state },
          'Estado inesperado al despachar al FSM, se ignora el turno',
        );
        return { actions: [], nextState: lead.state };
    }
  }

  /**
   * Traduce la acción de los guardrails a un efecto sobre el turno. Recibe el
   * `lead` porque la liberación por timeout de 48hs necesita saber hasta dónde
   * había llegado la conversación (ver `handoff_timeout_release`); el resto de
   * las ramas no dependen del lead y quedan igual que antes.
   */
  private resolveGuardrail(
    tenant: Tenant,
    lead: Lead,
    action: GuardrailAction,
  ): GuardrailOutcome {
    switch (action.type) {
      case 'opt_out':
        return {
          stop: true,
          replies: [OPT_OUT_CONFIRMATION],
          leadUpdate: {
            state: ConversationState.OPTED_OUT,
            optedOutAt: new Date(),
          },
        };
      case 'handoff':
        return {
          stop: true,
          replies: [buildHandoffFarewell(tenant)],
          leadUpdate: {
            state: ConversationState.HUMAN_HANDOFF,
            handoffAt: new Date(),
          },
        };
      case 'silenced':
        return { stop: true, replies: [], leadUpdate: {} };
      case 'handoff_timeout_release':
        // El estado de retorno lo decide la FSM, no un hardcodeo: mismo criterio
        // que el release manual del admin (`resolveReleaseState`, spec V-B2
        // decisión 5 / AC-8). Un lead al que ya se le mostraron fichas vuelve a
        // SEARCH_MATCH y no se le vuelve a preguntar todo de cero.
        return {
          stop: false,
          replies: [HANDOFF_TIMEOUT_APOLOGY],
          leadUpdate: {
            state: resolveReleaseState(lead),
            handoffAt: null,
          },
        };
      case 'continue':
      default:
        return { stop: false, replies: [], leadUpdate: {} };
    }
  }

  private async sendTexts(
    tenant: Tenant,
    lead: Lead,
    texts: string[],
  ): Promise<void> {
    await this.sendActions(
      tenant,
      lead,
      texts.map((text): OutgoingAction => ({ kind: 'text', text })),
    );
  }

  private async sendActions(
    tenant: Tenant,
    lead: Lead,
    actions: OutgoingAction[],
  ): Promise<void> {
    for (const action of actions) {
      if (action.kind === 'text') {
        if (action.text) {
          const text = applyFormality(action.text, tenant.botFormality);
          await this.messaging.sendText(tenant, lead.phone, text);
        }
        continue;
      }

      if (
        !this.outputValidator.isPropertyWhitelisted(
          action.property.id,
          lead.lastSearchIds,
        )
      ) {
        this.logger.error(
          { propertyId: action.property.id, lastSearchIds: lead.lastSearchIds },
          'Se intentó enviar una propiedad fuera de lastSearchIds; se bloquea el envío',
        );
        continue;
      }

      const photo = action.property.photos[0];
      const caption = applyFormality(
        formatPropertyCaption(action.property, action.index, action.filters),
        tenant.botFormality,
      );
      if (photo) {
        await this.messaging.sendImage(tenant, lead.phone, photo.url, caption);
      } else {
        await this.messaging.sendText(tenant, lead.phone, caption);
      }
    }
  }

  private async persistLeadUpdate(
    lead: Lead,
    result: HandlerResult,
    turnCount: number,
    leadNameFromThisTurn: string | null,
  ): Promise<void> {
    const data: Prisma.LeadUpdateInput = {
      state: result.nextState,
      lastMessageAt: new Date(),
      turnCount,
    };

    // Captura de nombre (spec 09, T1.1, AC-14): nunca pisa un nombre ya
    // guardado (podría venir corregido a mano desde el panel).
    if (leadNameFromThisTurn && !lead.name) {
      data.name = leadNameFromThisTurn;
    }

    if (result.filterUpdates) {
      data.fOperation = result.filterUpdates.fOperation;
      data.fNeighborhoods = result.filterUpdates.fNeighborhoods;
      data.fMaxPrice = result.filterUpdates.fMaxPrice;
      data.fCurrency = result.filterUpdates.fCurrency;
      data.fMinRooms = result.filterUpdates.fMinRooms;
      data.fGarage = result.filterUpdates.fGarage;
      data.fPetsAllowed = result.filterUpdates.fPetsAllowed;
      data.fNotes = result.filterUpdates.fNotes;
      data.fOfferedNeighborhoods = result.filterUpdates.fOfferedNeighborhoods;
      data.fPriceMentionedAtTurn = result.filterUpdates.fPriceMentionedAtTurn;
    }
    if (result.preferredDay) {
      data.fPreferredDay = result.preferredDay;
    }
    if (result.markGreeted && !lead.greetedAt) {
      data.greetedAt = new Date();
    }
    if (result.markNameAsked && !lead.nameAskedAt) {
      data.nameAskedAt = new Date();
    }
    // Calificación comercial (spec 09, T1.4): persistido centralmente, igual
    // que filterUpdates, para que el handler nunca escriba directo a la DB.
    if (result.commercialUpdate) {
      const u = result.commercialUpdate;
      if (u.qGuarantee !== undefined) data.qGuarantee = u.qGuarantee;
      if (u.qPaymentMethod !== undefined) data.qPaymentMethod = u.qPaymentMethod;
      if (u.qTimeline !== undefined) data.qTimeline = u.qTimeline;
      if (u.qHasPropertyToSell !== undefined) {
        data.qHasPropertyToSell = u.qHasPropertyToSell;
      }
      if (u.qAskedFields !== undefined) data.qAskedFields = u.qAskedFields;
      if (u.pendingPropertyId !== undefined) {
        data.pendingPropertyId = u.pendingPropertyId;
      }
      if (u.qBuyingSignalAt !== undefined) {
        data.qBuyingSignalAt = u.qBuyingSignalAt;
      }
    }
    if (
      result.nextState === ConversationState.HUMAN_HANDOFF &&
      lead.state !== ConversationState.HUMAN_HANDOFF
    ) {
      data.handoffAt = new Date();
    }

    // Score (spec 09, T1.5, AC-38): se recalcula SIEMPRE en código al final
    // del turno, sobre el lead YA con los cambios de este turno aplicados
    // (para que, p.ej., una garantía recién contestada cuente en el mismo
    // turno en que se guarda, no recién en el siguiente).
    const scoreResult = calculateLeadScore({
      ...lead,
      name: (data.name as string | null | undefined) ?? lead.name,
      fOperation:
        (data.fOperation as Lead['fOperation'] | undefined) ??
        lead.fOperation,
      fMaxPrice:
        (data.fMaxPrice as Lead['fMaxPrice'] | undefined) ?? lead.fMaxPrice,
      qAskedFields:
        (data.qAskedFields as string[] | undefined) ?? lead.qAskedFields,
      qTimeline:
        (data.qTimeline as string | null | undefined) ?? lead.qTimeline,
      qGuarantee:
        (data.qGuarantee as string | null | undefined) ?? lead.qGuarantee,
      qPaymentMethod:
        (data.qPaymentMethod as string | null | undefined) ??
        lead.qPaymentMethod,
      qBuyingSignalAt:
        (data.qBuyingSignalAt as Date | null | undefined) ??
        lead.qBuyingSignalAt,
    });
    data.qScore = scoreResult.score;
    data.qScoreLabel = scoreResult.label;

    await this.prisma.lead.update({ where: { id: lead.id }, data });
  }

  private async loadRecentMessages(
    tenantId: string,
    leadId: string,
  ): Promise<ConversationMessage[]> {
    const messages = await this.prisma.message.findMany({
      where: { tenantId, leadId },
      orderBy: { createdAt: 'desc' },
      take: RECENT_MESSAGES_LIMIT,
    });
    return messages.reverse().map((message) => ({
      direction: message.direction,
      body: message.transcription ?? message.body ?? '',
    }));
  }
}
