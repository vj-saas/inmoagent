import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CancelAppointmentDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
