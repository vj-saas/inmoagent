import { Injectable } from '@nestjs/common';
import { ConversationState, OperationType } from '@prisma/client';
import { PropertySearchService } from '../../properties/property-search.service';
import { getAdjacentZones } from '../../properties/zone-adjacency';
import {
  countFilledCoreFilters,
  delegatesZoneChoice,
  firstMissingFilter,
  isPriceStale,
} from '../filters.util';
import { leadSeed } from '../copy-variants.util';
import { SafeReplyService } from '../safe-reply.service';
import {
  buildDelegatedZoneMessage,
  buildMissingFilterFallback,
  buildNameRequestMessage,
  buildNoResultsMessage,
  buildPartialZoneDropMessage,
  buildSameResultsMessage,
  buildSearchClosingQuestion,
  buildSearchIntro,
  buildTeaserClosingQuestion,
  buildTeaserIntro,
  buildUnderstandingEcho,
  buildZoneStillPendingMessage,
  buildZoneSuggestionMessage,
} from '../templates';
import type {
  HandlerContext,
  HandlerResult,
  LeadFilters,
  OutgoingAction,
} from '../conversation.types';

@Injectable()
export class QualificationHandler {
  constructor(
    private readonly propertySearch: PropertySearchService,
    private readonly safeReply: SafeReplyService,
  ) {}

  async handle(
    ctx: HandlerContext,
    filters: LeadFilters,
  ): Promise<HandlerResult> {
    // Corte temprano: si el lead fijó una zona sin stock, no seguimos preguntando
    // ambientes/presupuesto para después decir que no hay nada. Avisamos ya,
    // sugiriendo zonas aledañas (o las de más movimiento) con permiso, y
    // limpiamos la zona muerta para que la próxima que diga/acepte la reemplace.
    //
    // El chequeo es POR ZONA (no agregado): los barrios se acumulan (§4.1 de
    // filters.util.ts), así que si el lead ya tenía Caballito/Belgrano y agrega
    // Munro (sin stock), un chequeo agregado (`in: [...]`) da true porque
    // Caballito sí tiene — y Munro termina mezclado en la búsqueda, cayendo en
    // el mensaje de "está por encima de tu presupuesto" cuando en realidad esa
    // zona puntual no tiene NADA (no es un problema de precio).
    if (filters.fNeighborhoods.length > 0) {
      const zonesWithStock = await this.propertySearch.zonesWithStock(
        ctx.tenant.id,
        filters.fNeighborhoods,
        filters.fOperation,
      );
      const emptyZones = filters.fNeighborhoods.filter(
        (zone) => !zonesWithStock.includes(zone),
      );
      if (emptyZones.length === filters.fNeighborhoods.length) {
        return this.suggestAlternativeZones(ctx, filters);
      }
      if (emptyZones.length > 0) {
        return {
          actions: [
            {
              kind: 'text',
              text: buildPartialZoneDropMessage(emptyZones, zonesWithStock),
            },
          ],
          nextState: ConversationState.QUALIFICATION,
          filterUpdates: { ...filters, fNeighborhoods: zonesWithStock },
        };
      }
    }

    // §6.1: monto sospechoso para una compra (p.ej. "800 dólares" para comprar
    // un depto) -> confirmar moneda antes de buscar mal. Solo dispara con
    // precio NUEVO este turno (no en cada turno posterior) para no trabarse
    // preguntando lo mismo en loop.
    if (
      ctx.extraction.maxPrice !== null &&
      filters.fOperation === OperationType.SALE &&
      this.isSuspiciousSalePrice(filters.fMaxPrice, filters.fCurrency)
    ) {
      return {
        actions: [
          {
            kind: 'text',
            text: 'Solo para confirmar, ¿ese presupuesto es en dólares o en pesos?',
          },
        ],
        nextState: ConversationState.QUALIFICATION,
        filterUpdates: filters,
      };
    }

    // §6.1: confirmación suave cuando los ambientes se dedujeron de la
    // composición familiar en vez de un número explícito.
    const roomsConfirmation =
      ctx.extraction.roomsInferred && filters.fMinRooms !== null
        ? `Para ese grupo te armé la búsqueda con ${filters.fMinRooms} ambientes, avisame si querés ajustarlo. `
        : '';

    if (filters.fOperation && countFilledCoreFilters(filters) >= 2) {
      const result = await this.triggerSearch(ctx, filters);
      if (roomsConfirmation && result.actions[0]?.kind === 'text') {
        result.actions[0].text = roomsConfirmation + result.actions[0].text;
      }
      return result;
    }

    // §3: búsqueda teaser. Con operación + zona (con stock) ya alcanza para
    // mostrar algo real, sin esperar ambientes/presupuesto. Solo dispara la
    // PRIMERA vez (si el lead ya venía de SEARCH_MATCH, ya vio algo: se
    // pregunta lo que falta normal en vez de volver a mostrar un teaser).
    if (
      ctx.lead.state !== ConversationState.SEARCH_MATCH &&
      filters.fOperation &&
      filters.fNeighborhoods.length > 0
    ) {
      return this.triggerTeaser(ctx, filters);
    }

    return this.askMissingFilter(ctx, filters, roomsConfirmation);
  }

  private async askMissingFilter(
    ctx: HandlerContext,
    filters: LeadFilters,
    prefix = '',
  ): Promise<HandlerResult> {
    const missing = firstMissingFilter(filters);

    // QA personas §6: si falta la zona y el lead delega la elección ("me da
    // igual, vos qué me recomendás"), ofrecemos las zonas con más movimiento
    // en vez de repetirle la misma pregunta en loop. La aceptación ("dale",
    // "sí") la resuelve el mecanismo de fOfferedNeighborhoods de §4.
    if (missing === 'neighborhood' && delegatesZoneChoice(ctx.turnText)) {
      const zones = await this.propertySearch.topStockZones(
        ctx.tenant.id,
        filters.fOperation,
        2,
      );
      if (zones.length > 0) {
        return {
          actions: [{ kind: 'text', text: buildDelegatedZoneMessage(zones) }],
          nextState: ConversationState.QUALIFICATION,
          filterUpdates: { ...filters, fOfferedNeighborhoods: zones },
        };
      }
    }

    // Ya le ofrecimos zonas alternativas (fOfferedNeighborhoods pendiente) y
    // este turno sigue sin resolver la zona: no repetir la pregunta genérica
    // en loop (QA 2026-07-27, ver sim-personas "17-zona-fuera-cobertura") —
    // ser honesto de nuevo y reofrecer, en vez de dejar que el LLM improvise
    // sobre una zona que ya dijimos que no tenemos.
    if (missing === 'neighborhood' && filters.fOfferedNeighborhoods.length > 0) {
      return {
        actions: [
          {
            kind: 'text',
            text: buildZoneStillPendingMessage(filters.fOfferedNeighborhoods),
          },
        ],
        nextState: ConversationState.QUALIFICATION,
        filterUpdates: filters,
      };
    }

    const question = await this.safeReply.compose(
      {
        tenant: ctx.tenant,
        lead: ctx.lead,
        recentMessages: ctx.recentMessages,
        instruction: this.buildFollowUpInstruction(filters, missing),
      },
      buildMissingFilterFallback(
        missing,
        filters.fNeighborhoods,
        leadSeed(ctx.lead),
      ),
    );

    return {
      actions: [{ kind: 'text', text: prefix + question }],
      nextState: ConversationState.QUALIFICATION,
      filterUpdates: filters,
    };
  }

  /**
   * Búsqueda teaser (§3): operación + zona alcanzan. Muestra hasta 3 fichas
   * cubriendo el rango de precios de la zona y califica sobre resultados
   * (excepción a "una pregunta por mensaje": acá se permite doble pregunta
   * porque el lead ya vio valor real). Si no hay ninguna propiedad (no
   * debería pasar, ya se verificó stock antes), cae al flujo normal.
   */
  private async triggerTeaser(
    ctx: HandlerContext,
    filters: LeadFilters,
  ): Promise<HandlerResult> {
    const outcome = await this.propertySearch.teaserSearch(
      ctx.tenant.id,
      ctx.lead.id,
      filters.fOperation as OperationType,
      filters.fNeighborhoods,
    );

    if (outcome.properties.length === 0) {
      return this.askMissingFilter(ctx, filters);
    }

    const actions: OutgoingAction[] = [
      {
        kind: 'text',
        text: buildTeaserIntro(filters.fNeighborhoods, leadSeed(ctx.lead)),
      },
    ];
    outcome.properties.forEach((property, i) => {
      actions.push({ kind: 'property', property, index: i + 1 });
    });
    actions.push({
      kind: 'text',
      text: buildTeaserClosingQuestion(outcome.properties.length),
    });

    // Pedido de nombre (spec 09, T1.1, AC-17): el teaser ya mostró valor real.
    const askName = this.shouldAskName(ctx);
    if (askName) {
      actions.push({
        kind: 'text',
        text: buildNameRequestMessage(leadSeed(ctx.lead)),
      });
    }

    return {
      actions,
      nextState: ConversationState.SEARCH_MATCH,
      filterUpdates: filters,
      markNameAsked: askName,
    };
  }

  /** SALE + monto implausible para la moneda inferida (§6.1). */
  private isSuspiciousSalePrice(
    price: number | null,
    currency: string | null,
  ): boolean {
    if (price === null) return false;
    if (currency === 'USD') return price < 20000;
    if (currency === 'ARS') return price < 5000000;
    return false;
  }

  /**
   * Zona sin stock (§4): sugiere hasta 2 zonas aledañas con stock; si no hay
   * aledañas mapeadas o ninguna tiene stock, cae a las 2 zonas con más
   * movimiento. Nunca amplía sola: guarda la sugerencia en
   * `fOfferedNeighborhoods` y pide permiso.
   */
  /** Público: lo reutiliza GreetingHandler cuando la zona sin stock viene desde el primer mensaje. */
  async suggestAlternativeZones(
    ctx: HandlerContext,
    filters: LeadFilters,
  ): Promise<HandlerResult> {
    const requestedZone = filters.fNeighborhoods[0];
    const adjacent = getAdjacentZones(requestedZone);
    const adjacentWithStock = await this.propertySearch.zonesWithStock(
      ctx.tenant.id,
      adjacent,
      filters.fOperation,
    );

    const usingFallback = adjacentWithStock.length === 0;
    const suggestions = usingFallback
      ? await this.propertySearch.topStockZones(
          ctx.tenant.id,
          filters.fOperation,
          2,
        )
      : adjacentWithStock.slice(0, 2);

    return {
      actions: [
        {
          kind: 'text',
          text: buildZoneSuggestionMessage(
            requestedZone,
            suggestions,
            usingFallback,
          ),
        },
      ],
      nextState: ConversationState.QUALIFICATION,
      filterUpdates: {
        ...filters,
        fNeighborhoods: [],
        fOfferedNeighborhoods: suggestions,
      },
    };
  }

  private async triggerSearch(
    ctx: HandlerContext,
    filters: LeadFilters,
  ): Promise<HandlerResult> {
    const previousSearchIds = ctx.lead.lastSearchIds;
    // Si el lead no reafirmó precio/moneda en los últimos turnos, no lo
    // aplicamos a ESTA búsqueda (aunque queda guardado en `filters` por si
    // vuelve a ser relevante): sin esto, un presupuesto dicho hace muchos
    // turnos —o en una sesión de prueba anterior sobre un lead reutilizado—
    // termina tapando stock real que no tiene nada que ver con esa cifra.
    const priceStale = isPriceStale(filters, ctx.lead.turnCount);
    const outcome = await this.propertySearch.searchAndRecordForLead(
      ctx.tenant.id,
      ctx.lead.id,
      {
        operation: filters.fOperation as OperationType,
        neighborhoods: filters.fNeighborhoods,
        maxPrice: priceStale ? null : filters.fMaxPrice,
        currency: priceStale ? null : filters.fCurrency,
        minRooms: filters.fMinRooms,
        garage: filters.fGarage,
        petsAllowed: filters.fPetsAllowed,
        // Señal de ESTE turno, no un filtro persistido (igual que roomsInferred):
        // solo tiene efecto si el lead lo dijo ahora, no se arrastra a turnos futuros.
        priceFlexible: ctx.extraction.priceFlexible,
      },
    );

    // El lead pidió "mostrame" de nuevo sin cambiar nada y el resultado es
    // idéntico al último enviado: no re-mandamos las mismas fichas (QA §8).
    // `outcome.relaxed === null` es clave (QA 2026-07-27, WhatsApp real): si
    // hubo que relajar algo para llegar a este resultado (ej. pidió
    // "monoambiente" y no hay, así que se relajan ambientes y da la casualidad
    // de que el más cercano es el mismo que ya se había mostrado), el lead
    // hizo una pregunta nueva y necesita la respuesta honesta de por qué
    // ("no tengo monoambiente, esto es lo más parecido"), no el genérico
    // "ya te mostré todo" — aunque las fichas resultantes coincidan.
    const sameAsBefore =
      ctx.lead.state === ConversationState.SEARCH_MATCH &&
      outcome.relaxed === null &&
      outcome.properties.length > 0 &&
      outcome.properties.length === previousSearchIds.length &&
      outcome.properties.every((p, i) => p.id === previousSearchIds[i]);
    if (sameAsBefore) {
      return {
        actions: [
          { kind: 'text', text: buildSameResultsMessage(leadSeed(ctx.lead)) },
        ],
        nextState: ConversationState.SEARCH_MATCH,
        filterUpdates: filters,
      };
    }

    const actions: OutgoingAction[] = [];
    // Eco de comprensión (spec 09, T2.5, AC-12): solo en la PRIMERA búsqueda
    // completa del lead (todavía no pasó por SEARCH_MATCH) y solo si hay algo
    // para mostrar — armado 100% de los filtros persistidos, nunca del LLM
    // (AC-13).
    const isFirstFullSearch = ctx.lead.state !== ConversationState.SEARCH_MATCH;
    if (isFirstFullSearch && outcome.properties.length > 0) {
      actions.push({ kind: 'text', text: buildUnderstandingEcho(filters) });
    }
    if (outcome.properties.length > 0) {
      actions.push({
        kind: 'text',
        text: outcome.relaxed
          ? buildNoResultsMessage(outcome.relaxed, filters.fNeighborhoods)
          : buildSearchIntro(leadSeed(ctx.lead)),
      });
      outcome.properties.forEach((property, i) => {
        actions.push({ kind: 'property', property, index: i + 1 });
      });
      actions.push({
        kind: 'text',
        text: buildSearchClosingQuestion(
          outcome.properties.length,
          leadSeed(ctx.lead),
        ),
      });
    } else {
      actions.push({
        kind: 'text',
        text: buildNoResultsMessage(outcome.relaxed, filters.fNeighborhoods),
      });
    }

    // Pedido de nombre (spec 09, T1.1, AC-17): solo cuando hubo algo real para
    // mostrar, nunca antes.
    const askName = outcome.properties.length > 0 && this.shouldAskName(ctx);
    if (askName) {
      actions.push({
        kind: 'text',
        text: buildNameRequestMessage(leadSeed(ctx.lead)),
      });
    }

    return {
      actions,
      nextState: ConversationState.SEARCH_MATCH,
      filterUpdates: filters,
      markNameAsked: askName,
    };
  }

  /** ¿Corresponde preguntar el nombre? Solo si no lo tenemos y todavía no se
   * le preguntó (spec 09, T1.1, AC-17): se pregunta una única vez por lead. */
  private shouldAskName(ctx: HandlerContext): boolean {
    return ctx.lead.name === null && ctx.lead.nameAskedAt === null;
  }

  private buildFollowUpInstruction(
    filters: LeadFilters,
    missing: 'neighborhood' | 'price' | 'rooms',
  ): string {
    const known: string[] = [];
    if (filters.fOperation) known.push(`operación: ${filters.fOperation}`);
    if (filters.fNeighborhoods.length > 0)
      known.push(`barrios: ${filters.fNeighborhoods.join(', ')}`);
    if (filters.fMaxPrice)
      known.push(`presupuesto máximo: ${filters.fMaxPrice}`);
    if (filters.fMinRooms)
      known.push(`ambientes mínimos: ${filters.fMinRooms}`);

    const missingQuestion: Record<typeof missing, string> = {
      neighborhood: 'en qué barrio o zona busca',
      price: 'cuál es su presupuesto máximo (y moneda)',
      rooms: 'cuántos ambientes como mínimo busca',
    };
    const extraGuidance: Record<typeof missing, string> = {
      neighborhood:
        'Arrancá con un acuse de recibo breve y entusiasta de lo que ya dijo (si dijo algo) y aclará que puede nombrar más de un barrio.',
      rooms: `Arrancá reconociendo la zona que ya dijo (${filters.fNeighborhoods.join(', ') || 'la zona'}) antes de preguntar.`,
      price:
        'Anticipá que es la última pregunta antes de mostrarle opciones ("última y te muestro opciones"), y aclará que un número aproximado alcanza.',
    };

    return `Datos que ya tenés del lead: ${known.join('; ') || '(ninguno todavía)'}. Hacele UNA sola pregunta breve y natural para saber ${missingQuestion[missing]}. No repreguntes lo que ya sabés. ${extraGuidance[missing]}`;
  }
}
