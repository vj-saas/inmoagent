import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { TenantThrottlerGuard } from '../../common/tenant-throttler.guard';
import { PersonOrApiKeyGuard } from '../guards/person-or-api-key.guard';
import { AppointmentsAdminService } from './appointments-admin.service';
import { CancelAppointmentDto } from './dto/cancel-appointment.dto';
import { CloseAppointmentDto } from './dto/close-appointment.dto';
import { ConfirmAppointmentDto } from './dto/confirm-appointment.dto';
import { ListAppointmentsQueryDto } from './dto/list-appointments-query.dto';
import { RescheduleAppointmentDto } from './dto/reschedule-appointment.dto';

@Controller('admin/tenants/:tenantId/appointments')
@UseGuards(TenantThrottlerGuard, PersonOrApiKeyGuard)
@Throttle({ default: { limit: 120, ttl: 60_000 } })
export class AppointmentsAdminController {
  constructor(private readonly appointments: AppointmentsAdminService) {}

  @Get()
  async list(
    @Param('tenantId') tenantId: string,
    @Query() query: ListAppointmentsQueryDto,
  ) {
    return this.appointments.list(tenantId, query);
  }

  @Post(':aid/confirm')
  @HttpCode(200)
  async confirm(
    @Param('tenantId') tenantId: string,
    @Param('aid') aid: string,
    @Body() dto: ConfirmAppointmentDto,
  ) {
    return this.appointments.confirm(tenantId, aid, dto);
  }

  @Post(':aid/reschedule')
  @HttpCode(200)
  async reschedule(
    @Param('tenantId') tenantId: string,
    @Param('aid') aid: string,
    @Body() dto: RescheduleAppointmentDto,
  ) {
    return this.appointments.reschedule(tenantId, aid, dto);
  }

  @Post(':aid/cancel')
  @HttpCode(200)
  async cancel(
    @Param('tenantId') tenantId: string,
    @Param('aid') aid: string,
    @Body() dto: CancelAppointmentDto,
  ) {
    return this.appointments.cancel(tenantId, aid, dto);
  }

  @Post(':aid/done')
  @HttpCode(200)
  async done(
    @Param('tenantId') tenantId: string,
    @Param('aid') aid: string,
    @Body() dto: CloseAppointmentDto,
  ) {
    return this.appointments.done(tenantId, aid, dto);
  }

  @Post(':aid/no-show')
  @HttpCode(200)
  async noShow(
    @Param('tenantId') tenantId: string,
    @Param('aid') aid: string,
    @Body() dto: CloseAppointmentDto,
  ) {
    return this.appointments.noShow(tenantId, aid, dto);
  }
}
