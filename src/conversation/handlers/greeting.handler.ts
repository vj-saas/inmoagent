import { Injectable } from '@nestjs/common';
import { ConversationState } from '@prisma/client';
import { PropertySearchService } from '../../properties/property-search.service';
import { SafeReplyService } from '../safe-reply.service';
import {
  buildGreetingMessage,
  OPERATION_FOLLOWUP_FALLBACK,
} from '../templates';
import type {
  HandlerContext,
  HandlerResult,
  LeadFilters,
} from '../conversation.types';
import { QualificationHandler } from './qualification.handler';

@Injectable()
export class GreetingHandler {
  constructor(
    private readonly qualification: QualificationHandler,
    private readonly propertySearch: PropertySearchService,
    private readonly safeReply: SafeReplyService,
  ) {}

  async handle(
    ctx: HandlerContext,
    filters: LeadFilters,
  ): Promise<HandlerResult> {
    if (!filters.fOperation) {
      // El saludo completo (con el aviso de Ley 25.326) solo se manda una vez, en el
      // primerísimo turno. Si el lead ya lo recibió y todavía no dijo si compra o
      // alquila, repetir el saludo entero es lo que generaba el bug de "me repite
      // el mensaje inicial": en vez de eso, se repregunta corto. Se usa `greetedAt`
      // en vez de `recentMessages` porque el mensaje OUT se persiste recién cuando
      // el worker de la cola de salida efectivamente lo envía, no en este mismo turno.
      const alreadyGreeted = ctx.lead.greetedAt !== null;

      // Si desde el primer mensaje menciona una zona sin stock, se lo decimos ya
      // (con el saludo/aviso de datos si es la primera vez), sugiriendo aledañas
      // con permiso, en vez de preguntar comprar/alquilar para después descubrir
      // que no hay nada.
      if (filters.fNeighborhoods.length > 0) {
        const hasStock = await this.propertySearch.hasStockInZone(
          ctx.tenant.id,
          filters.fNeighborhoods,
          null,
        );
        if (!hasStock) {
          const suggestion = await this.qualification.suggestAlternativeZones(
            ctx,
            filters,
          );
          return {
            ...suggestion,
            actions: alreadyGreeted
              ? suggestion.actions
              : [
                  { kind: 'text', text: buildGreetingMessage(ctx.tenant) },
                  ...suggestion.actions,
                ],
            nextState: ConversationState.GREETING,
            markGreeted: true,
          };
        }
      }

      if (!alreadyGreeted) {
        return {
          actions: [{ kind: 'text', text: buildGreetingMessage(ctx.tenant) }],
          nextState: ConversationState.GREETING,
          filterUpdates: filters,
          markGreeted: true,
        };
      }

      return this.askForOperation(ctx, filters);
    }

    // El primer mensaje ya trae info ("hola busco depto en caballito para alquilar"): se extrae
    // todo y se puede saltar directo a QUALIFICATION o incluso SEARCH_MATCH en el mismo turno.
    return this.qualification.handle(ctx, filters);
  }

  private async askForOperation(
    ctx: HandlerContext,
    filters: LeadFilters,
  ): Promise<HandlerResult> {
    const known: string[] = [];
    if (filters.fNeighborhoods.length > 0)
      known.push(`barrios: ${filters.fNeighborhoods.join(', ')}`);

    const question = await this.safeReply.compose(
      {
        tenant: ctx.tenant,
        lead: ctx.lead,
        recentMessages: ctx.recentMessages,
        instruction: `Datos que ya tenés del lead: ${known.join('; ') || '(ninguno todavía)'}. Ya le mandaste el saludo inicial antes, no lo repitas. Hacele UNA sola pregunta breve y natural para saber si busca comprar o alquilar.`,
      },
      OPERATION_FOLLOWUP_FALLBACK,
    );

    return {
      actions: [{ kind: 'text', text: question }],
      nextState: ConversationState.GREETING,
      filterUpdates: filters,
    };
  }
}
