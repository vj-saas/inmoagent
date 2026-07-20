import { IsArray, IsString } from 'class-validator';
import type { MetaWebhookEntry } from '../meta-webhook.types';

/**
 * Sólo se valida la forma exterior del payload de Meta: string `object` +
 * array `entry`. El contenido interno de cada `entry` es demasiado variable
 * (decenas de campos opcionales según tipo de mensaje/evento) para modelarlo
 * exhaustivamente con class-validator; se parsea defensivamente en
 * WebhookService contra los tipos de meta-webhook.types.ts.
 */
export class WhatsAppWebhookDto {
  @IsString()
  object!: string;

  @IsArray()
  entry!: MetaWebhookEntry[];
}
