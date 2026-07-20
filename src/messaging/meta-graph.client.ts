import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvConfig } from '../config/env.schema';

const GRAPH_API_VERSION = 'v21.0';
const GRAPH_API_BASE_URL = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

/** wa_id AR de celular de CABA/GBA: 549 11 + 8 dígitos. Ej: 5491131838472. */
const AR_MOBILE_WA_ID = /^549(11)(\d{8})$/;

export interface MetaSendResult {
  waMessageId: string;
}

interface MetaGraphResponse {
  messages?: Array<{ id: string }>;
  error?: { message: string };
}

/** Cliente HTTP fino sobre la WhatsApp Cloud API (Graph API). Sin retries: eso vive en la cola `outbound`. */
@Injectable()
export class MetaGraphClient {
  private readonly logger = new Logger(MetaGraphClient.name);

  constructor(private readonly config: ConfigService<EnvConfig, true>) {}

  sendText(
    phoneNumberId: string,
    accessToken: string,
    to: string,
    body: string,
  ): Promise<MetaSendResult> {
    return this.post(phoneNumberId, accessToken, {
      messaging_product: 'whatsapp',
      to: this.resolveRecipient(to),
      type: 'text',
      text: { body },
    });
  }

  sendImage(
    phoneNumberId: string,
    accessToken: string,
    to: string,
    imageUrl: string,
    caption?: string,
  ): Promise<MetaSendResult> {
    return this.post(phoneNumberId, accessToken, {
      messaging_product: 'whatsapp',
      to: this.resolveRecipient(to),
      type: 'image',
      image: { link: imageUrl, caption },
    });
  }

  /** Mensaje business-initiated con un template pre-aprobado (ver docs/05-OPERACIONES.md §5). */
  sendTemplate(
    phoneNumberId: string,
    accessToken: string,
    to: string,
    templateName: string,
    languageCode: string,
    bodyParams: string[],
  ): Promise<MetaSendResult> {
    return this.post(phoneNumberId, accessToken, {
      messaging_product: 'whatsapp',
      to: this.resolveRecipient(to),
      type: 'template',
      template: {
        name: templateName,
        language: { code: languageCode },
        components:
          bodyParams.length > 0
            ? [
                {
                  type: 'body',
                  parameters: bodyParams.map((text) => ({
                    type: 'text',
                    text,
                  })),
                },
              ]
            : undefined,
      },
    });
  }

  async markAsRead(
    phoneNumberId: string,
    accessToken: string,
    waMessageId: string,
  ): Promise<void> {
    await this.post(phoneNumberId, accessToken, {
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: waMessageId,
    });
  }

  /**
   * Con un número de WhatsApp de producción, el `wa_id` entrante sirve tal cual
   * como destinatario. El número de PRUEBA de Meta, en cambio, exige direccionar
   * a los celulares argentinos con el "15" local (54 11 15 XXXXXXXX). Este ajuste
   * se activa SOLO con `WA_SANDBOX_AR_RECIPIENT=true` (default off).
   */
  private resolveRecipient(to: string): string {
    if (!this.config.get('WA_SANDBOX_AR_RECIPIENT', { infer: true })) {
      return to;
    }
    const match = AR_MOBILE_WA_ID.exec(to);
    if (!match) {
      return to;
    }
    const [, area, subscriber] = match;
    return `54${area}15${subscriber}`;
  }

  private async post(
    phoneNumberId: string,
    accessToken: string,
    payload: Record<string, unknown>,
  ): Promise<MetaSendResult> {
    const response = await fetch(
      `${GRAPH_API_BASE_URL}/${phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      },
    );

    const json = (await response
      .json()
      .catch(() => null)) as MetaGraphResponse | null;

    if (!response.ok) {
      const message = json?.error?.message ?? response.statusText;
      this.logger.error(
        { status: response.status, message },
        'Meta Graph API respondió con error',
      );
      throw new Error(`Meta Graph API error (${response.status}): ${message}`);
    }

    return { waMessageId: json?.messages?.[0]?.id ?? '' };
  }
}
