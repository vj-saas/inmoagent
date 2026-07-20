import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvConfig } from '../config/env.schema';
import {
  rawExtractionSchema,
  sanitizeExtraction,
  type ExtractionResult,
} from './extraction.schema';
import type {
  ComposeReplyInput,
  ExtractIntentInput,
  LlmProvider,
} from './llm-provider.interface';
import { buildSystemPrompt, EXTRACTION_INSTRUCTION } from './prompts';

const OPENAI_CHAT_URL = 'https://api.openai.com/v1/chat/completions';

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string } }>;
  error?: { message: string };
}

@Injectable()
export class OpenAiLlmProvider implements LlmProvider {
  private readonly logger = new Logger(OpenAiLlmProvider.name);

  constructor(private readonly config: ConfigService<EnvConfig, true>) {}

  async extractIntent(
    input: ExtractIntentInput,
  ): Promise<ExtractionResult | null> {
    const attempt = async () => {
      const raw = await this.callChatApi(this.buildExtractionMessages(input), {
        jsonMode: true,
      });
      const parsedJson = this.tryParseJson(raw);
      return parsedJson === null
        ? null
        : rawExtractionSchema.safeParse(parsedJson);
    };

    const first = await attempt();
    if (first && first.success) {
      return sanitizeExtraction(first.data);
    }

    this.logger.warn('Extracción con schema inválido, reintentando una vez');
    const second = await attempt();
    if (second && second.success) {
      return sanitizeExtraction(second.data);
    }

    this.logger.error(
      'Extracción inválida tras el reintento; se le va a pedir al lead que reformule',
    );
    return null;
  }

  async composeReply(input: ComposeReplyInput): Promise<string> {
    const messages: ChatMessage[] = [
      { role: 'system', content: buildSystemPrompt(input.tenant) },
      ...this.historyMessages(input.recentMessages),
      { role: 'user', content: input.instruction },
    ];
    const content = await this.callChatApi(messages, { jsonMode: false });
    return content.trim();
  }

  private buildExtractionMessages(input: ExtractIntentInput): ChatMessage[] {
    return [
      { role: 'system', content: buildSystemPrompt(input.tenant) },
      { role: 'system', content: EXTRACTION_INSTRUCTION },
      ...this.historyMessages(input.recentMessages),
      { role: 'user', content: input.turnText },
    ];
  }

  private historyMessages(
    recentMessages: ExtractIntentInput['recentMessages'],
  ): ChatMessage[] {
    return recentMessages.map((message) => ({
      role: message.direction === 'IN' ? 'user' : 'assistant',
      content: message.body,
    }));
  }

  private tryParseJson(text: string): unknown {
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }

  private async callChatApi(
    messages: ChatMessage[],
    options: { jsonMode: boolean },
  ): Promise<string> {
    const apiKey = this.config.get('OPENAI_API_KEY', { infer: true });
    const model = this.config.get('LLM_MODEL', { infer: true });

    const response = await fetch(OPENAI_CHAT_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages,
        ...(options.jsonMode
          ? { response_format: { type: 'json_object' } }
          : {}),
      }),
    });

    const json = (await response
      .json()
      .catch(() => null)) as ChatCompletionResponse | null;

    if (!response.ok) {
      const message = json?.error?.message ?? response.statusText;
      throw new Error(`OpenAI error (${response.status}): ${message}`);
    }

    const content = json?.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('OpenAI no devolvió contenido en la respuesta');
    }
    return content;
  }
}
