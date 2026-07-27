import { Injectable, Logger } from '@nestjs/common';
import { AppointmentStatus, type Appointment } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PushNotificationService } from '../push-notifications/push-notification.service';

@Injectable()
export class AppointmentsService {
  private readonly logger = new Logger(AppointmentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pushNotificationService: PushNotificationService,
  ) {}

  /** Crea el Appointment en PROPOSED, vinculado (o no) a una propiedad puntual. */
  async propose(
    tenantId: string,
    leadId: string,
    propertyId: string | null,
  ): Promise<Appointment> {
    const appt = await this.prisma.appointment.create({
      data: {
        tenantId,
        leadId,
        propertyId,
        status: AppointmentStatus.PROPOSED,
      },
    });

    // Disparar push en segundo plano (best effort, AC-6)
    this.pushNotificationService
      .notifyAppointmentProposed(tenantId, appt)
      .catch((err) => {
        this.logger.error(`Error al disparar push notifyAppointmentProposed: ${err.message}`);
      });

    return appt;
  }

  /** Obtiene una cita propuesta por su ID. */
  async findProposedOrThrow(id: string): Promise<Appointment & { lead: { name: string | null; phone: string }; tenant: { name: string; workHoursStart: string; workHoursEnd: string } }> {
    const appt = await this.prisma.appointment.findFirst({
      where: { id, status: AppointmentStatus.PROPOSED },
      include: {
        lead: { select: { name: true, phone: true } },
        tenant: { select: { name: true, workHoursStart: true, workHoursEnd: true } },
      },
    });
    if (!appt) {
      throw new Error('Cita propuesta no encontrada o ya coordinada');
    }
    return appt as any;
  }

  /**
   * Calcula los intervalos de 30 min libres para una fecha dada de un tenant.
   * Filtra las citas ya confirmadas en el mismo horario.
   */
  async getAvailableSlots(tenantId: string, dateStr: string): Promise<string[]> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { workHoursStart: true, workHoursEnd: true },
    });
    if (!tenant) return [];

    const startStr = tenant.workHoursStart || '09:00';
    const endStr = tenant.workHoursEnd || '18:00';

    const [startH, startM] = startStr.split(':').map(Number);
    const [endH, endM] = endStr.split(':').map(Number);

    // Obtener citas confirmadas para ese día
    const targetDate = new Date(dateStr);
    const startOfDay = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 0, 0, 0);
    const endOfDay = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 23, 59, 59);

    const confirmedAppts = await this.prisma.appointment.findMany({
      where: {
        tenantId,
        status: AppointmentStatus.CONFIRMED,
        scheduledAt: {
          gte: startOfDay,
          lte: endOfDay,
        },
      },
      select: { scheduledAt: true },
    });

    const busyTimes = new Set(
      confirmedAppts
        .filter((a) => a.scheduledAt)
        .map((a) => {
          const d = a.scheduledAt!;
          const h = String(d.getHours()).padStart(2, '0');
          const m = String(d.getMinutes()).padStart(2, '0');
          return `${h}:${m}`;
        })
    );

    const slots: string[] = [];
    let current = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), startH, startM, 0);
    const limit = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), endH, endM, 0);

    while (current < limit) {
      const h = String(current.getHours()).padStart(2, '0');
      const m = String(current.getMinutes()).padStart(2, '0');
      const timeStr = `${h}:${m}`;

      if (!busyTimes.has(timeStr)) {
        slots.push(timeStr);
      }
      current.setMinutes(current.getMinutes() + 30);
    }

    return slots;
  }

  /** Confirma una cita propuesta con la fecha/hora seleccionada. */
  async confirmPublic(id: string, scheduledAt: Date): Promise<Appointment> {
    const appt = await this.prisma.appointment.findFirst({
      where: { id, status: AppointmentStatus.PROPOSED },
    });
    if (!appt) {
      throw new Error('La cita no existe o ya no está en estado propuesto');
    }

    const updated = await this.prisma.appointment.update({
      where: { id },
      data: {
        status: AppointmentStatus.CONFIRMED,
        scheduledAt,
        notes: 'Confirmado por el cliente desde la agenda pública',
      },
    });

    if (updated.assignedUserId) {
      this.pushNotificationService
        .notifyAppointmentAssigned(updated.tenantId, updated.assignedUserId, updated)
        .catch((err) => {
          this.logger.error(`Error al disparar push notifyAppointmentAssigned: ${err.message}`);
        });
    }

    return updated;
  }
}
