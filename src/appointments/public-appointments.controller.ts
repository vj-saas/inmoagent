import { Controller, Get, Post, Body, Param, Query, NotFoundException, BadRequestException, HttpCode } from '@nestjs/common';
import { AppointmentsService } from './appointments.service';

@Controller('appointments/public')
export class PublicAppointmentsController {
  constructor(private readonly appointmentsService: AppointmentsService) {}

  @Get(':id')
  async getDetails(@Param('id') id: string) {
    try {
      const details = await this.appointmentsService.findProposedOrThrow(id);
      return {
        id: details.id,
        tenantName: details.tenant.name,
        leadName: details.lead.name || details.lead.phone,
        workHoursStart: details.tenant.workHoursStart,
        workHoursEnd: details.tenant.workHoursEnd,
      };
    } catch (err) {
      throw new NotFoundException((err as Error).message);
    }
  }

  @Get(':id/available-slots')
  async getSlots(
    @Param('id') id: string,
    @Query('date') date: string,
  ) {
    if (!date) {
      throw new BadRequestException('El parámetro date (YYYY-MM-DD) es requerido');
    }
    try {
      const details = await this.appointmentsService.findProposedOrThrow(id);
      const slots = await this.appointmentsService.getAvailableSlots(details.tenantId, date);
      return { slots };
    } catch (err) {
      throw new NotFoundException((err as Error).message);
    }
  }

  @Post(':id/confirm')
  @HttpCode(200)
  async confirm(
    @Param('id') id: string,
    @Body('scheduledAt') scheduledAtStr: string,
  ) {
    if (!scheduledAtStr) {
      throw new BadRequestException('El campo scheduledAt es requerido');
    }
    try {
      const scheduledAt = new Date(scheduledAtStr);
      if (isNaN(scheduledAt.getTime())) {
        throw new BadRequestException('Formato de fecha inválido');
      }
      const updated = await this.appointmentsService.confirmPublic(id, scheduledAt);
      return { success: true, status: updated.status, scheduledAt: updated.scheduledAt };
    } catch (err) {
      throw new BadRequestException((err as Error).message);
    }
  }
}
