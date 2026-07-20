export type OutboundJobData =
  | { kind: 'text'; tenantId: string; to: string; body: string }
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
