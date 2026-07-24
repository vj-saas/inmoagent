import { IsDateString, IsOptional, IsString, ValidateIf } from 'class-validator';

/**
 * PATCH parcial de la gestión del lead. Ambos campos son opcionales y admiten
 * `null` explícito (para desasignar / limpiar la fecha). La distinción entre
 * "campo ausente" y "campo enviado como null" NO se resuelve en el DTO
 * transformado sino sobre el body crudo (`'campo' in rawBody`), porque el
 * `ValidationPipe` no preserva de forma confiable esa diferencia tras el
 * `transform`. Acá solo se valida el *formato* de lo que sí vino.
 */
export class PatchAssignmentDto {
  @IsOptional()
  @ValidateIf((o) => o.assignedUserId !== null)
  @IsString()
  assignedUserId?: string | null;

  @IsOptional()
  @ValidateIf((o) => o.nextActionAt !== null)
  @IsDateString()
  nextActionAt?: string | null;
}
