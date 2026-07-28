import { ConversationState } from '@prisma/client';
import { SchedulingHandler } from './scheduling.handler';
import { AppointmentsService } from '../../appointments/appointments.service';
import { LeadAlertService } from '../lead-alert.service';
import { PushNotificationService } from '../../push-notifications/push-notification.service';
import type { HandlerContext } from '../conversation.types';

/**
 * Spec B.4 — disparador 1 (AC-6) y regresión de AC-14 sobre el punto exacto
 * que la spec identifica: `SchedulingHandler.enterScheduling`, mismo lugar
 * donde ya se invoca `LeadAlertService.notify()`.
 *
 * Contrato asumido: `SchedulingHandler` recibe una tercera dependencia
 * `PushNotificationService` (a crear en
 * `src/push-notifications/push-notification.service.ts`) y, luego de crear el
 * `Appointment` en PROPOSED, llama a
 * `pushNotifications.notifyAppointmentProposed(tenantId, appointment)` — la
 * cita recién creada no tiene `assignedUserId` (ver spec, Contexto), por eso
 * el disparador 1 nunca llama a `notifyAppointmentAssigned`.
 *
 * La resiliencia ante fallos de envío (AC-8) y la limpieza de suscripciones
 * inválidas (AC-9) se prueban en detalle en
 * `push-notifications/push-notification.service.spec.ts`; acá solo se cubre
 * el punto de disparo y la no-regresión de `LeadAlertService`.
 */
describe('SchedulingHandler — disparador push B.4', () => {
  const tenant = { id: 'tenant-1', schedulingLink: null } as HandlerContext['tenant'];
  const lead = { id: 'lead-1' } as HandlerContext['lead'];
  const createdAppointment = {
    id: 'appt-1',
    tenantId: 'tenant-1',
    leadId: 'lead-1',
    propertyId: null,
    assignedUserId: null,
  };

  let appointments: { propose: jest.Mock };
  let leadAlert: { notify: jest.Mock };
  let pushNotifications: {
    notifyAppointmentProposed: jest.Mock;
    notifyAppointmentAssigned: jest.Mock;
  };
  let handler: SchedulingHandler;

  beforeEach(() => {
    appointments = { propose: jest.fn().mockResolvedValue(createdAppointment) };
    leadAlert = { notify: jest.fn().mockResolvedValue(undefined) };
    pushNotifications = {
      notifyAppointmentProposed: jest.fn().mockResolvedValue(undefined),
      notifyAppointmentAssigned: jest.fn().mockResolvedValue(undefined),
    };

    handler = new SchedulingHandler(
      appointments as unknown as AppointmentsService,
      leadAlert as unknown as LeadAlertService,
      pushNotifications as unknown as PushNotificationService,
    );
  });

  function ctx(): HandlerContext {
    return {
      tenant,
      lead,
      turnText: 'quiero coordinar una visita',
    } as HandlerContext;
  }

  // AC-6
  it('AC-6: al crear el Appointment en PROPOSED, notifica vía push a todo el tenant (sin assignedUserId)', async () => {
    const result = await handler.enterScheduling(ctx(), null);

    expect(pushNotifications.notifyAppointmentProposed).toHaveBeenCalledWith(
      'tenant-1',
      expect.objectContaining({ id: 'appt-1' }),
    );
    expect(pushNotifications.notifyAppointmentAssigned).not.toHaveBeenCalled();
    expect(result.nextState).toBe(ConversationState.HUMAN_HANDOFF);
  });

  // AC-14: regresión — LeadAlertService.notify() sigue funcionando en paralelo, sin cambios.
  it('AC-14: preserva sin cambios la invocación existente de LeadAlertService.notify()', async () => {
    await handler.enterScheduling(ctx(), null);

    expect(leadAlert.notify).toHaveBeenCalledTimes(1);
    expect(leadAlert.notify).toHaveBeenCalledWith(tenant, lead, null);
  });

  // spec 09, T2.3, AC-7: la preferencia de día se pregunta recién al confirmar
  // interés (no antes, en el cierre de la búsqueda).
  it('AC-7: si el lead no dijo su preferencia de día, se la pregunta en un mensaje aparte', async () => {
    const result = await handler.enterScheduling(ctx(), null);

    const texts = result.actions.map((a) =>
      a.kind === 'text' ? a.text : '',
    );
    expect(texts.some((t) => /entre semana/i.test(t) && /sábado/i.test(t))).toBe(
      true,
    );
    // Cada mensaje sigue siendo una sola pregunta (AC-8).
    for (const text of texts) {
      expect((text.match(/\?/g) ?? []).length).toBeLessThanOrEqual(1);
    }
  });

  it('AC-7: si el lead ya dijo su preferencia de día, NO se le vuelve a preguntar', async () => {
    const result = await handler.enterScheduling(
      {
        tenant,
        lead,
        turnText: 'me interesa, prefiero el sábado',
      } as HandlerContext,
      null,
    );

    const texts = result.actions.map((a) =>
      a.kind === 'text' ? a.text : '',
    );
    expect(texts.some((t) => /entre semana/i.test(t))).toBe(false);
    expect(result.preferredDay).toBe('sábado');
  });
});
