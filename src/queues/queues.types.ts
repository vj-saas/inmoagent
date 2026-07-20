/** Job encolado por WebhookService en `inbound`/`media` para un Message ya persistido. */
export interface MessageQueueJob {
  tenantId: string;
  leadId: string;
  messageId: string;
}
