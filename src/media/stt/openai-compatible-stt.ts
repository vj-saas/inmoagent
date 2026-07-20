import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';

interface TranscriptionResponse {
  text?: string;
  error?: { message: string };
}

/**
 * Groq y OpenAI exponen el mismo contrato `/audio/transcriptions`
 * (multipart, campo `file` + `model`, Bearer auth). Se comparte la llamada
 * HTTP; cada provider sólo fija baseUrl/apiKey/model.
 */
export async function transcribeViaOpenAiCompatibleApi(
  baseUrl: string,
  apiKey: string,
  model: string,
  filePath: string,
): Promise<string> {
  const fileBuffer = await readFile(filePath);
  const form = new FormData();
  form.append(
    'file',
    new Blob([new Uint8Array(fileBuffer)], { type: 'audio/mpeg' }),
    basename(filePath),
  );
  form.append('model', model);

  const response = await fetch(`${baseUrl}/audio/transcriptions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  const json = (await response
    .json()
    .catch(() => null)) as TranscriptionResponse | null;

  if (!response.ok) {
    const message = json?.error?.message ?? response.statusText;
    throw new Error(`STT error (${response.status}): ${message}`);
  }
  if (!json?.text) {
    throw new Error('La respuesta de STT no incluyó texto transcripto');
  }
  return json.text;
}
