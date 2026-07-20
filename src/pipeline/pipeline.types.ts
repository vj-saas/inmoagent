export interface DebounceEntry {
  messageId: string;
  body: string;
  type: string;
  createdAt: string;
}

/** Job delayed que dispara el procesamiento de un turno para un lead. */
export interface TurnJobData {
  tenantId: string;
  leadId: string;
}
