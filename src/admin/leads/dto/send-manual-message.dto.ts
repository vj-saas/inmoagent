import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/**
 * Envío manual de un mensaje de texto a un lead por parte de un asesor humano.
 * El `trim` se aplica ANTES de validar (vía `@Transform`) para que un texto de
 * solo espacios en blanco caiga en `@IsNotEmpty` y devuelva 400, en vez de
 * enviarse un mensaje vacío. `@MaxLength(4096)` está alineado al límite de
 * body de texto de WhatsApp Cloud API — no cambiar.
 */
export class SendManualMessageDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(4096)
  text!: string;
}
