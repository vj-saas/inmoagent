import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvConfig } from '../../config/env.schema';
import { transcribeViaOpenAiCompatibleApi } from './openai-compatible-stt';
import type { SttProvider } from './stt-provider.interface';

const GROQ_BASE_URL = 'https://api.groq.com/openai/v1';
const GROQ_MODEL = 'whisper-large-v3-turbo';

@Injectable()
export class GroqSttProvider implements SttProvider {
  readonly name = 'groq' as const;

  constructor(private readonly config: ConfigService<EnvConfig, true>) {}

  transcribe(filePath: string): Promise<string> {
    const apiKey = this.config.get('GROQ_API_KEY', { infer: true });
    return transcribeViaOpenAiCompatibleApi(
      GROQ_BASE_URL,
      apiKey,
      GROQ_MODEL,
      filePath,
    );
  }
}
