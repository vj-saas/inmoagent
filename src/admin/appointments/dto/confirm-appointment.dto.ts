import { IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';

export class ConfirmAppointmentDto {
  @IsDateString()
  scheduledAt!: string;

  @IsOptional()
  @IsString()
  assignedUserId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
