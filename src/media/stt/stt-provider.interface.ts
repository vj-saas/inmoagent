export interface SttProvider {
  readonly name: 'groq' | 'openai';
  transcribe(filePath: string): Promise<string>;
}
