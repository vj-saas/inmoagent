export type OutboundJobData =
  | {
      kind: 'text';
      tenantId: string;
      to: string;
      body: string;
      /**
       * Id de un `Message` OUT ya persistido (envío manual desde la bandeja):
       * el processor lo actualiza con el `waMessageId` de Meta en vez de crear
       * una segunda fila. Si no viene, el processor crea el `Message` (bot).
       */
      messageId?: string;
    }
  | {
      kind: 'image';
      tenantId: string;
      to: string;
      imageUrl: string;
      caption?: string;
    }
  | { kind: 'read'; tenantId: string; waMessageId: string }
  | {
      kind: 'template';
      tenantId: string;
      to: string;
      templateName: string;
      languageCode: string;
      bodyParams: string[];
    };
