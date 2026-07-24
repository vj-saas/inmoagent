import { Transform } from 'class-transformer';
import { IsDateString, IsEnum, IsOptional } from 'class-validator';
import { AppointmentStatus } from '@prisma/client';

export class ListAppointmentsQueryDto {
  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') {
      return undefined;
    }
    return Array.isArray(value) ? value : [value];
  })
  @IsEnum(AppointmentStatus, { each: true })
  status?: AppointmentStatus[];

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}
