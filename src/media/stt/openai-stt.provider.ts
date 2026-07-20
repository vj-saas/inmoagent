import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvConfig } from '../../config/env.schema';
import { transcribeViaOpenAiCompatibleApi } from './openai-compatible-stt';
import type { SttProvider } from './stt-provider.interface';

const OPENAI_BASE_URL = 'https://api.openai.com/v1';
const OPENAI_MODEL = 'whisper-1';

@Injectable()
export class OpenAiSttProvider implements SttProvider {
  readonly name = 'openai' as const;

  constructor(private readonly config: ConfigService<EnvConfig, true>) {}

  transcribe(filePath: string): Promise<string> {
    const apiKey = this.config.get('OPENAI_API_KEY', { infer: true });
    return transcribeViaOpenAiCompatibleApi(
      OPENAI_BASE_URL,
      apiKey,
      OPENAI_MODEL,
      filePath,
    );
  }
}
