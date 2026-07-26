import {
  BadGatewayException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  ConversationState,
  MessageDirection,
  MessageType,
  type Lead,
  type Message,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { MessagingService } from '../../messaging/messaging.service';
import { TenantsService } from '../../tenants/tenants.service';
import { DebounceBufferService } from '../../pipeline/debounce-buffer.service';
import { AdminLeadsService } from './admin-leads.service';
import {
  SERVICE_WINDOW_CLOSED_MESSAGE,
  isServiceWindowOpen,
} from './service-window.util';

/** Copy en español del 409 cuando el bot tiene el lead tomado (AC-7). */
export const LEAD_LOCKED_MESSAGE =
  'El asistente está terminando de responder a este lead, reintentá en unos segundos.';

/** Copy en español del 409 sobre un lead que pidió la baja (AC-2). */
export const LEAD_OPTED_OUT_MESSAGE =
  'El lead pidió la baja: no se le puede volver a escribir.';

export interface SendManualResult {
  message: Message;
  lead: Lead;
}

/**
 * Único lugar que orquesta el envío manual de un asesor humano a un lead
 * (`POST /admin/leads/:leadId/send`). Concentra las tres barreras críticas de
 * la spec V-B2:
 *
 * - AC-2: un lead `OPTED_OUT` se rechaza ANTES de cualquier escritura, y el
 *   `updateMany` con `state: { not: OPTED_OUT }` vuelve a chequearlo de forma
 *   atómica dentro de la transacción (opt-out concurrente del bot).
 * - AC-3: la ventana de servicio de 24hs de Meta se evalúa sobre el último
 *   `Message` `IN`, ANTES de la transacción, para no dejar un `Message` OUT
 *   huérfano de un envío que Meta rechazaría.
 * - AC-7: todo el bloque escritura + encolado corre bajo el MISMO lock de lead
 *   de Redis que usa el debounce, así el bot y un humano nunca responden a la
 *   vez.
 *
 * Todas las queries van filtradas por `tenantId` (el de la sesión), incluidas
 * las de dentro de la transacción: un `leadId` de otro tenant da 404 y nunca
 * llega a escribir.
 */
@Injectable()
export class AdminLeadMessagingService {
  private readonly logger = new Logger(AdminLeadMessagingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly leads: AdminLeadsService,
    private readonly messaging: MessagingService,
    private readonly tenants: TenantsService,
    private readonly debounceBuffer: DebounceBufferService,
  ) {}

  async sendManual(
    tenantId: string,
    leadId: string,
    personId: string,
    text: string,
  ): Promise<SendManualResult> {
    // (1) 404 unificado cross-tenant (AC-13).
    const lead = await this.leads.findLeadOrThrow(tenantId, leadId);

    // (2) Opt-out: se corta sin tocar absolutamente nada (AC-2).
    if (lead.state === ConversationState.OPTED_OUT) {
      throw new ConflictException(LEAD_OPTED_OUT_MESSAGE);
    }

    // (3) Ventana de servicio de 24hs, ANTES de la tx (AC-3).
    const lastInboundAt = await this.findLastInboundAt(tenantId, leadId);
    if (!isServiceWindowOpen(lastInboundAt, new Date())) {
      throw new ConflictException(SERVICE_WINDOW_CLOSED_MESSAGE);
    }

    // El tenant se resuelve fuera del lock (solo lectura, no es un side effect)
    // para no sostener el lock más tiempo del necesario.
    const tenant = await this.tenants.findById(tenantId);
    if (!tenant) {
      throw new NotFoundException('Tenant no encontrado');
    }

    // (4) Exclusión mutua con el turno del bot. `withLeadLock` devuelve `null`
    // SOLO si no pudo tomar el lock: el resultado de `fn` es siempre un objeto,
    // nunca `null`, para que los dos casos no se confundan.
    const result = await this.debounceBuffer.withLeadLock<SendManualResult>(
      tenantId,
      leadId,
      async () => {
        // (4a) Escritura atómica: estado del lead + Message OUT.
        const { message, lead: updatedLead } = await this.prisma.$transaction(
          async (tx) => {
            // El `state: { not: OPTED_OUT }` en el WHERE hace que Postgres
            // evalúe la condición y escriba en el mismo statement: si el bot
            // hizo opt-out entre el chequeo (2) y este punto, afecta 0 filas y
            // abortamos la transacción sin haber creado el Message.
            const updated = await tx.lead.updateMany({
              where: {
                id: leadId,
                tenantId,
                state: { not: ConversationState.OPTED_OUT },
              },
              data: {
                state: ConversationState.HUMAN_HANDOFF,
                handoffAt: new Date(),
              },
            });
            if (updated.count === 0) {
              // Lanzar dentro del callback revierte la transacción entera.
              throw new ConflictException(LEAD_OPTED_OUT_MESSAGE);
            }

            const created = await tx.message.create({
              data: {
                tenantId,
                leadId,
                direction: MessageDirection.OUT,
                type: MessageType.TEXT,
                body: text,
                sentByPersonId: personId,
              },
            });

            const freshLead = await this.leads.findLeadOrThrow(
              tenantId,
              leadId,
              tx,
            );
            return { message: created, lead: freshLead };
          },
        );

        // (4b) Post-commit, aún dentro del lock: recién con el `Message` ya
        // commiteado se encola el envío, pasando su `id` para que el processor
        // lo actualice con el `waMessageId` en vez de crear un segundo
        // `Message` (AC-12).
        try {
          await this.messaging.sendText(tenant, lead.phone, text, {
            messageId: message.id,
          });
        } catch (error: unknown) {
          // El encolado falló: el `Message` OUT ya commiteado sería un mensaje
          // fantasma en el timeline (el asesor vería como enviado algo que
          // nunca salió). Se compensa borrándolo.
          await this.deleteMessageCompensating(tenantId, message.id);
          this.logger.error(
            { tenantId, leadId, messageId: message.id, err: error },
            'Falló el encolado del envío manual: se borró el Message OUT compensatoriamente',
          );
          throw new BadGatewayException(
            'No se pudo encolar el envío a WhatsApp, reintentá en unos instantes.',
          );
        }

        return { message, lead: updatedLead };
      },
    );

    if (result === null) {
      throw new ConflictException(LEAD_LOCKED_MESSAGE);
    }

    return result;
  }

  /**
   * Último `Message` entrante del lead (`direction = IN`), base de la ventana
   * de servicio de 24hs. Filtrado por `tenantId` además de `leadId`.
   */
  private async findLastInboundAt(
    tenantId: string,
    leadId: string,
  ): Promise<Date | null> {
    const lastInbound = await this.prisma.message.findFirst({
      where: { tenantId, leadId, direction: MessageDirection.IN },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    return lastInbound?.createdAt ?? null;
  }

  /**
   * Borrado compensatorio del `Message` OUT cuando el encolado falló. Nunca
   * puede tapar el 502 original: si el delete también falla se loguea y se
   * sigue (`deleteMany` filtrado por tenant, idempotente por definición).
   */
  private async deleteMessageCompensating(
    tenantId: string,
    messageId: string,
  ): Promise<void> {
    try {
      await this.prisma.message.deleteMany({
        where: { id: messageId, tenantId },
      });
    } catch (error: unknown) {
      this.logger.error(
        { tenantId, messageId, err: error },
        'Falló el borrado compensatorio del Message OUT: queda un mensaje persistido que nunca se envió',
      );
    }
  }
}
