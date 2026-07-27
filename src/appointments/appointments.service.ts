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
}
