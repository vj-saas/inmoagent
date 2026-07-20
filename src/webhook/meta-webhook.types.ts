/**
 * Formas mínimas del payload de webhook de WhatsApp Cloud API que usamos.
 * Meta envía muchos más campos opcionales; no se modelan exhaustivamente acá
 * (ver WhatsAppWebhookDto para la validación de forma en el borde de la API).
 */

export interface MetaWebhookPayload {
  object: string;
  entry: MetaWebhookEntry[];
}

export interface MetaWebhookEntry {
  id: string;
  changes: MetaWebhookChange[];
}

export interface MetaWebhookChange {
  field: string;
  value: MetaWebhookValue;
}

export interface MetaWebhookValue {
  messaging_product: 'whatsapp';
  metadata: { display_phone_number?: string; phone_number_id: string };
  contacts?: Array<{ profile?: { name?: string }; wa_id: string }>;
  messages?: MetaWebhookMessage[];
  statuses?: MetaWebhookStatus[];
}

export type MetaMessageType =
  | 'text'
  | 'audio'
  | 'image'
  | 'document'
  | 'video'
  | 'sticker'
  | 'location'
  | 'contacts'
  | 'button'
  | 'interactive'
  | 'reaction'
  | 'order'
  | 'system'
  | 'unknown';

export interface MetaWebhookMessage {
  from: string;
  id: string;
  timestamp: string;
  type: MetaMessageType;
  text?: { body: string };
  audio?: { id: string; mime_type?: string };
  image?: { id: string; mime_type?: string; caption?: string };
  document?: {
    id: string;
    mime_type?: string;
    caption?: string;
    filename?: string;
  };
  [key: string]: unknown;
}

export interface MetaWebhookStatus {
  id: string;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  timestamp: string;
  recipient_id: string;
  [key: string]: unknown;
}
