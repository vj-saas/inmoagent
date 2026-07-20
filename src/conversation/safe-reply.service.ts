import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  LLM_PROVIDER,
  type ComposeReplyInput,
  type LlmProvider,
} from '../llm/llm-provider.interface';
import { OutputValidatorService } from './output-validator.service';

/**
 * Envoltorio de `LlmProvider.composeReply` + validación de salida (§5): si
 * el texto menciona un competidor, re-redacta una vez; si persiste, o si
 * detecta datos sensibles, usa el fallback determinístico del caller.
 */
@Injectable()
export class SafeReplyService {
  private readonly logger = new Logger(SafeReplyService.name);

  constructor(
    @Inject(LLM_PROVIDER) private readonly llm: LlmProvider,
    private readonly validator: OutputValidatorService,
  ) {}

  async compose(input: ComposeReplyInput, fallback: string): Promise<string> {
    const context = { competitorsToAvoid: input.tenant.competitorsToAvoid };

    const first = await this.llm.composeReply(input);
    const firstResult = this.validator.sanitize(first, context);

    if (firstResult.hadSensitiveData) {
      this.logger.warn(
        'Respuesta del LLM con posibles datos sensibles, se usa el fallback determinístico',
      );
      return fallback;
    }
    if (!firstResult.hadForbiddenMention) {
      return firstResult.text;
    }

    this.logger.warn(
      'Respuesta del LLM mencionó a un competidor, re-redactando una vez',
    );
    const retryInstruction = `${input.instruction}\n\nIMPORTANTE: tu respuesta anterior nombró a un competidor. No lo hagas esta vez.`;
    const second = await this.llm.composeReply({
      ...input,
      instruction: retryInstruction,
    });
    const secondResult = this.validator.sanitize(second, context);

    if (secondResult.hadForbiddenMention || secondResult.hadSensitiveData) {
      this.logger.warn(
        'La respuesta sigue siendo inválida tras el reintento, se usa el fallback determinístico',
      );
      return fallback;
    }
    return secondResult.text;
  }
}
