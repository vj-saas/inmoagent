import type { Lead, Tenant } from '@prisma/client';
import type { ExtractionResult } from './extraction.schema';

export interface ConversationMessage {
  direction: 'IN' | 'OUT';
  body: string;
}

export interface ExtractIntentInput {
  tenant: Tenant;
  lead: Lead;
  turnText: string;
  recentMessages: ConversationMessage[];
}

export interface ComposeReplyInput {
  tenant: Tenant;
  lead: Lead;
  recentMessages: ConversationMessage[];
  /** Directiva concreta de qué debe redactar el LLM en este turno (la decide el código, no el LLM). */
  instruction: string;
}

export const LLM_PROVIDER = Symbol('LLM_PROVIDER');

export interface LlmProvider {
  /** `null` si tras un reintento el LLM sigue sin devolver un JSON válido. */
  extractIntent(input: ExtractIntentInput): Promise<ExtractionResult | null>;
  composeReply(input: ComposeReplyInput): Promise<string>;
}
