import { Injectable } from '@nestjs/common';
import { ConversationState } from '@prisma/client';
import { AppointmentsService } from '../../appointments/appointments.service';
import type { PropertyWithPhotos } from '../../properties/property-search.service';
import { extractDayPreference } from '../filters.util';
import { LeadAlertService } from '../lead-alert.service';
import { buildSchedulingHandoffMessage } from '../templates';
import type { HandlerContext, HandlerResult } from '../conversation.types';
import { PushNotificationService } from '../../push-notifications/push-notification.service';

@Injectable()
export class SchedulingHandler {
  constructor(
    private readonly appointments: AppointmentsService,
    private readonly leadAlert: LeadAlertService,
    private readonly pushNotifications: PushNotificationService,
  ) {}

  /** Crea el Appointment (PROPOSED), notifica al tenant, y cierra con el asesor humano. */
  async enterScheduling(
    ctx: HandlerContext,
    property: PropertyWithPhotos | null,
  ): Promise<HandlerResult> {
    const appointment = await this.appointments.propose(
      ctx.tenant.id,
      ctx.lead.id,
      property?.id ?? null,
    );

    await this.pushNotifications.notifyAppointmentProposed(ctx.tenant.id, appointment).catch(() => {});

    // La preferencia de día (§5.2) es un dato operativo para el asesor: se
    // parsea determinísticamente (no vía LLM) y se cuela en el parámetro de
    // propiedad de la alerta interna para no romper el template de Meta ya
    // aprobado (que tiene 4 parámetros fijos).
    const preferredDay = extractDayPreference(ctx.turnText);
    const propertyTitleForAlert = property?.title
      ? preferredDay
        ? `${property.title} (prefiere ${preferredDay})`
        : property.title
      : preferredDay
        ? `Sin propiedad puntual (prefiere ${preferredDay})`
        : null;
    await this.leadAlert.notify(ctx.tenant, ctx.lead, propertyTitleForAlert);

    const actions: HandlerResult['actions'] = [];
    const baseUrl = process.env.PUBLIC_BASE_URL || 'http://localhost:5173';
    const scheduleUrl = `${baseUrl}/agenda/publica/${appointment.id}`;
    
    actions.push({
      kind: 'text',
      text: `Buenísimo, coordiná el horario que te quede mejor acá: ${scheduleUrl}`,
    });
    actions.push({
      kind: 'text',
      text: buildSchedulingHandoffMessage(ctx.tenant),
    });

    return {
      actions,
      nextState: ConversationState.HUMAN_HANDOFF,
      preferredDay,
    };
  }

  /** Si el lead vuelve a escribir estando en SCHEDULING (edge case raro), repetimos el cierre. */
  async handle(ctx: HandlerContext): Promise<HandlerResult> {
    return this.enterScheduling(ctx, null);
  }
}
