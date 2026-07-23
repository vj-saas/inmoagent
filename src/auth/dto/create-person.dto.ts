import { PersonRole } from '@prisma/client';
import { IsEmail, IsEnum, IsOptional, IsString, MinLength, ValidateIf } from 'class-validator';

export class CreatePersonDto {
  @IsEmail()
  email!: string;

  @IsEnum(PersonRole)
  role!: PersonRole;

  /**
   * Opcional: si no viene, el sistema genera una contraseña temporal
   * (ver `people.service.ts`). Si viene, debe cumplir el mínimo de 8
   * caracteres (AC-4) igual que en el bootstrap del primer owner.
   */
  @IsOptional()
  @ValidateIf((dto: CreatePersonDto) => dto.password !== undefined)
  @IsString()
  @MinLength(8)
  password?: string;
}
