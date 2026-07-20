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
} from './filters.util';
import { GreetingHandler } from './handlers/greeting.handler';
import { QualificationHandler } from './handlers/qualification.handler';
import { SchedulingHandler } from './handlers/scheduling.handler';
import { SearchMatchHandler } from './handlers/search-match.handler';
import { GuardrailsService } from './guardrails/guardrails.service';
import type { GuardrailAction } from './guardrails/guardrails.types';
import { LeadAlertService } from './lead-alert.service';
import { OutputValidatorService } from './output-validator.service';
import { SafeReplyService } from './safe-reply.service';
import {
  buildHandoffFarewell,
  formatPropertyCaption,
  HANDOFF_TIMEOUT_APOLOGY,
  OFF_TOPIC_REDIRECT_FALLBACK,
  OPT_OUT_CONFIRMATION,
  REFORMULATE_REQUEST,
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
    private readonly scheduling: SchedulingHandler,
  ) {}

  async handleTurn(
    tenantId: string,
    leadId: string,
    turnText: string,
  ): Promise<void> {
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
    const guardrailOutcome = this.resolveGuardrail(tenant, guardrailAction);

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
        REFORMULATE_REQUEST,
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
    await this.persistLeadUpdate(freshLead, result, turnCount);
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
        OFF_TOPIC_REDIRECT_FALLBACK,
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

  private resolveGuardrail(
    tenant: Tenant,
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
        return {
          stop: false,
          replies: [HANDOFF_TIMEOUT_APOLOGY],
          leadUpdate: {
            state: ConversationState.QUALIFICATION,
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
          await this.messaging.sendText(tenant, lead.phone, action.text);
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
      const caption = formatPropertyCaption(action.property, action.index);
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
  ): Promise<void> {
    const data: Prisma.LeadUpdateInput = {
      state: result.nextState,
      lastMessageAt: new Date(),
      turnCount,
    };

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
    if (
      result.nextState === ConversationState.HUMAN_HANDOFF &&
      lead.state !== ConversationState.HUMAN_HANDOFF
    ) {
      data.handoffAt = new Date();
    }

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
