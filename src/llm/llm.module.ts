import { Module } from '@nestjs/common';
import { LLM_PROVIDER } from './llm-provider.interface';
import { OpenAiLlmProvider } from './openai-llm.provider';

@Module({
  providers: [
    OpenAiLlmProvider,
    { provide: LLM_PROVIDER, useExisting: OpenAiLlmProvider },
  ],
  exports: [LLM_PROVIDER],
})
export class LlmModule {}
