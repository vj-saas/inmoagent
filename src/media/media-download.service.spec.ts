import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MediaDownloadService } from './media-download.service';

describe('MediaDownloadService', () => {
  const originalFetch = global.fetch;
  let fetchMock: jest.Mock;
  const destPath = join(tmpdir(), `media-download-test-${Date.now()}.bin`);

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock;
  });

  afterEach(async () => {
    await fs.rm(destPath, { force: true });
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  function metadataResponse(url: string) {
    return { ok: true, status: 200, json: () => Promise.resolve({ url }) };
  }

  function binaryResponse(bytes: Uint8Array, contentLength?: number) {
    return {
      ok: true,
      status: 200,
      body: {},
      headers: new Map([
        ['content-length', String(contentLength ?? bytes.byteLength)],
      ]),
      arrayBuffer: () => Promise.resolve(bytes.buffer),
    };
  }

  it('resuelve la URL del media y descarga el archivo', async () => {
    const payload = new TextEncoder().encode('contenido-de-audio-simulado');
    fetchMock
      .mockResolvedValueOnce(metadataResponse('https://cdn.example/media-1'))
      .mockResolvedValueOnce(binaryResponse(payload));

    const service = new MediaDownloadService();
    await service.download('media-1', 'token-abc', destPath);

    const written = await fs.readFile(destPath);
    expect(written.equals(Buffer.from(payload))).toBe(true);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://graph.facebook.com/v21.0/media-1',
      expect.objectContaining({
        headers: { Authorization: 'Bearer token-abc' },
      }),
    );
  });

  it('rechaza si Meta no puede resolver la URL del media', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 404 });

    const service = new MediaDownloadService();
    await expect(
      service.download('media-inexistente', 'token-abc', destPath),
    ).rejects.toThrow(/No se pudo resolver/);
  });

  it('rechaza si el media supera el límite de 16MB (por content-length)', async () => {
    const oversized = 17 * 1024 * 1024;
    fetchMock
      .mockResolvedValueOnce(
        metadataResponse('https://cdn.example/media-grande'),
      )
      .mockResolvedValueOnce(binaryResponse(new Uint8Array(0), oversized));

    const service = new MediaDownloadService();
    await expect(
      service.download('media-grande', 'token-abc', destPath),
    ).rejects.toThrow(/16MB/);
  });
});
