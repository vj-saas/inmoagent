import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/**
 * Alta de una nota humana sobre un lead. El `trim` se aplica ANTES de validar
 * (vía `@Transform`) para que un texto de solo espacios en blanco caiga en
 * `@IsNotEmpty` y devuelva 400, en vez de persistir una nota vacía (AC-6).
 */
export class CreateNoteDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  body!: string;
}
