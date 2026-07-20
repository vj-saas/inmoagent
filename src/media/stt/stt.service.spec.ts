import type { ConfigService } from '@nestjs/config';
import type { EnvConfig } from '../../config/env.schema';
import type { GroqSttProvider } from './groq-stt.provider';
import type { OpenAiSttProvider } from './openai-stt.provider';
import { SttService } from './stt.service';

function buildConfig(
  preferred: 'groq' | 'openai',
): ConfigService<EnvConfig, true> {
  return {
    get: jest.fn().mockReturnValue(preferred),
  } as unknown as ConfigService<EnvConfig, true>;
}

describe('SttService', () => {
  it('usa el provider primario (STT_PROVIDER=groq) cuando funciona', async () => {
    const groq = {
      name: 'groq',
      transcribe: jest.fn().mockResolvedValue('texto de groq'),
    } as unknown as GroqSttProvider;
    const openai = {
      name: 'openai',
      transcribe: jest.fn(),
    } as unknown as OpenAiSttProvider;
    const service = new SttService(buildConfig('groq'), groq, openai);

    const result = await service.transcribe('/tmp/audio.mp3');

    expect(result).toBe('texto de groq');
    expect(openai.transcribe).not.toHaveBeenCalled();
  });

  it('cae al fallback si el provider primario falla, sin perder la transcripción', async () => {
    const groq = {
      name: 'groq',
      transcribe: jest.fn().mockRejectedValue(new Error('Groq caído')),
    } as unknown as GroqSttProvider;
    const openai = {
      name: 'openai',
      transcribe: jest.fn().mockResolvedValue('texto de openai'),
    } as unknown as OpenAiSttProvider;
    const service = new SttService(buildConfig('groq'), groq, openai);

    const result = await service.transcribe('/tmp/audio.mp3');

    expect(result).toBe('texto de openai');
    expect(groq.transcribe).toHaveBeenCalledWith('/tmp/audio.mp3');
    expect(openai.transcribe).toHaveBeenCalledWith('/tmp/audio.mp3');
  });

  it('respeta STT_PROVIDER=openai como primario', async () => {
    const groq = {
      name: 'groq',
      transcribe: jest.fn(),
    } as unknown as GroqSttProvider;
    const openai = {
      name: 'openai',
      transcribe: jest.fn().mockResolvedValue('texto'),
    } as unknown as OpenAiSttProvider;
    const service = new SttService(buildConfig('openai'), groq, openai);

    await service.transcribe('/tmp/audio.mp3');

    expect(openai.transcribe).toHaveBeenCalled();
    expect(groq.transcribe).not.toHaveBeenCalled();
  });

  it('propaga el error si ambos providers fallan', async () => {
    const groq = {
      name: 'groq',
      transcribe: jest.fn().mockRejectedValue(new Error('groq down')),
    } as unknown as GroqSttProvider;
    const openai = {
      name: 'openai',
      transcribe: jest.fn().mockRejectedValue(new Error('openai down')),
    } as unknown as OpenAiSttProvider;
    const service = new SttService(buildConfig('groq'), groq, openai);

    await expect(service.transcribe('/tmp/audio.mp3')).rejects.toThrow(
      'openai down',
    );
  });
});
