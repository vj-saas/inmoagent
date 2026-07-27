import { AppointmentStatus } from '@prisma/client';
import { AppointmentsAdminService } from './appointments-admin.service';
import { PrismaService } from '../../prisma/prisma.service';
import { PushNotificationService } from '../../push-notifications/push-notification.service';

/**
 * Spec B.4 — disparador 2 (AC-7): al fijar `assignedUserId` (hoy solo posible
 * vía `AppointmentsAdminService.confirm`, con `assignedUserId` opcional en el
 * body), se notifica por push únicamente a esa `Person`, no al resto del
 * tenant.
 *
 * Contrato asumido: `AppointmentsAdminService` recibe una segunda dependencia
 * `PushNotificationService` y, cuando `confirm()` fija un `assignedUserId` no
 * nulo, llama a
 * `pushNotifications.notifyAppointmentAssigned(tenantId, assignedUserId, appointment)`.
 * Cuando `confirm()` NO recibe `assignedUserId` (queda sin asignar), no debe
 * notificar a nadie por este disparador (ver spec: el disparador 1, sin
 * asignación, lo maneja `SchedulingHandler`, no este servicio).
 */
describe('AppointmentsAdminService — disparador push B.4 (AC-7)', () => {
  const tenantId = 'tenant-1';
  const aid = 'appt-1';
  const futureDate = '2026-09-15T14:00:00.000Z';

  let prisma: {
    appointment: {
      findFirst: jest.Mock;
      updateMany: jest.Mock;
    };
    person: { findFirst: jest.Mock };
  };
  let pushNotifications: {
    notifyAppointmentProposed: jest.Mock;
    notifyAppointmentAssigned: jest.Mock;
  };
  let service: AppointmentsAdminService;

  function proposedAppointment() {
    return {
      id: aid,
      tenantId,
      leadId: 'lead-1',
      status: AppointmentStatus.PROPOSED,
      scheduledAt: null,
      assignedUserId: null,
      notes: null,
      outcome: null,
      propertyId: null,
    };
  }

  beforeEach(() => {
    prisma = {
      appointment: {
        findFirst: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      person: { findFirst: jest.fn() },
    };
    pushNotifications = {
      notifyAppointmentProposed: jest.fn().mockResolvedValue(undefined),
      notifyAppointmentAssigned: jest.fn().mockResolvedValue(undefined),
    };
    service = new AppointmentsAdminService(
      prisma as unknown as PrismaService,
      pushNotifications as unknown as PushNotificationService,
    );
  });

  it('AC-7: confirm() con assignedUserId notifica por push solo a esa Person', async () => {
    prisma.appointment.findFirst
      .mockResolvedValueOnce(proposedAppointment())
      .mockResolvedValueOnce({
        ...proposedAppointment(),
        status: AppointmentStatus.CONFIRMED,
        scheduledAt: new Date(futureDate),
        assignedUserId: 'person-assigned',
      });
    prisma.person.findFirst.mockResolvedValue({ id: 'person-assigned', tenantId });

    await service.confirm(tenantId, aid, {
      scheduledAt: futureDate,
      assignedUserId: 'person-assigned',
    } as never);

    expect(pushNotifications.notifyAppointmentAssigned).toHaveBeenCalledWith(
      tenantId,
      'person-assigned',
      expect.objectContaining({ id: aid }),
    );
  });

  it('AC-7: confirm() SIN assignedUserId no dispara ninguna notificación de asignación', async () => {
    prisma.appointment.findFirst
      .mockResolvedValueOnce(proposedAppointment())
      .mockResolvedValueOnce({
        ...proposedAppointment(),
        status: AppointmentStatus.CONFIRMED,
        scheduledAt: new Date(futureDate),
      });

    await service.confirm(tenantId, aid, {
      scheduledAt: futureDate,
    } as never);

    expect(pushNotifications.notifyAppointmentAssigned).not.toHaveBeenCalled();
  });
});
