import { Injectable } from '@nestjs/common';
import { AppointmentStatus, type Appointment } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AppointmentsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Crea el Appointment en PROPOSED, vinculado (o no) a una propiedad puntual. */
  propose(
    tenantId: string,
    leadId: string,
    propertyId: string | null,
  ): Promise<Appointment> {
    return this.prisma.appointment.create({
      data: {
        tenantId,
        leadId,
        propertyId,
        status: AppointmentStatus.PROPOSED,
      },
    });
  }
}
