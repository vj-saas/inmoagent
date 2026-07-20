import { Injectable } from '@nestjs/common';

const MAX_LENGTH = 1200;

/** Patrones defensivos contra fuga de tokens/IDs internos (docs/03-CONVERSACION.md §5.4). */
const SENSITIVE_PATTERNS = [
  /\bsk-[a-zA-Z0-9_-]{16,}/, // API keys estilo OpenAI
  /\bgsk_[a-zA-Z0-9_-]{16,}/, // API keys estilo Groq
  /\bBearer\s+[a-zA-Z0-9._-]{16,}/i,
  /\bEA[A-Za-z0-9]{40,}/, // access tokens de Meta Graph API
];

export interface ValidationContext {
  competitorsToAvoid: string[];
}

export interface ValidationResult {
  text: string;
  hadForbiddenMention: boolean;
  hadSensitiveData: boolean;
}

/** Validación de salida post-LLM (docs/03-CONVERSACION.md §5). */
@Injectable()
export class OutputValidatorService {
  sanitize(text: string, context: ValidationContext): ValidationResult {
    const hadSensitiveData = SENSITIVE_PATTERNS.some((pattern) =>
      pattern.test(text),
    );
    const hadForbiddenMention = context.competitorsToAvoid.some((competitor) =>
      new RegExp(this.escapeRegExp(competitor), 'i').test(text),
    );

    return { text: this.truncate(text), hadForbiddenMention, hadSensitiveData };
  }

  /** Un ID de propiedad sólo es válido para mostrarse si viene del último `search_properties`. */
  isPropertyWhitelisted(propertyId: string, lastSearchIds: string[]): boolean {
    return lastSearchIds.includes(propertyId);
  }

  private truncate(text: string): string {
    if (text.length <= MAX_LENGTH) {
      return text;
    }
    const truncated = text.slice(0, MAX_LENGTH);
    const lastBreak = Math.max(
      truncated.lastIndexOf('\n\n'),
      truncated.lastIndexOf('. '),
    );
    return (
      lastBreak > 0 ? truncated.slice(0, lastBreak + 1) : truncated
    ).trim();
  }

  private escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
