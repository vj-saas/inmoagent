import { IsOptional, IsString, MaxLength } from 'class-validator';

/** DTO compartido por `done` y `no-show`: mismo shape de body. */
export class CloseAppointmentDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  outcome?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
