import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvConfig } from '../../config/env.schema';
import { GroqSttProvider } from './groq-stt.provider';
import { OpenAiSttProvider } from './openai-stt.provider';
import type { SttProvider } from './stt-provider.interface';

@Injectable()
export class SttService {
  private readonly logger = new Logger(SttService.name);
  private readonly primary: SttProvider;
  private readonly fallback: SttProvider;

  constructor(
    config: ConfigService<EnvConfig, true>,
    groq: GroqSttProvider,
    openai: OpenAiSttProvider,
  ) {
    const preferred = config.get('STT_PROVIDER', { infer: true });
    this.primary = preferred === 'groq' ? groq : openai;
    this.fallback = preferred === 'groq' ? openai : groq;
  }

  async transcribe(filePath: string): Promise<string> {
    try {
      return await this.primary.transcribe(filePath);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        {
          err: message,
          primary: this.primary.name,
          fallback: this.fallback.name,
        },
        'STT primario falló, probando el fallback',
      );
      return this.fallback.transcribe(filePath);
    }
  }
}
