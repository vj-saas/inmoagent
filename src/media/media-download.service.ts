import { Injectable } from '@nestjs/common';
import { promises as fs } from 'node:fs';

const GRAPH_API_VERSION = 'v21.0';
const GRAPH_API_BASE_URL = `https://graph.facebook.com/${GRAPH_API_VERSION}`;
const MAX_MEDIA_BYTES = 16 * 1024 * 1024;
const DOWNLOAD_TIMEOUT_MS = 30_000;

/** Descarga un media de WhatsApp Cloud API (audio/imagen) a un archivo local. */
@Injectable()
export class MediaDownloadService {
  async download(
    mediaId: string,
    accessToken: string,
    destPath: string,
  ): Promise<void> {
    const mediaInfoRes = await fetch(`${GRAPH_API_BASE_URL}/${mediaId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!mediaInfoRes.ok) {
      throw new Error(
        `No se pudo resolver la URL del media ${mediaId} (status ${mediaInfoRes.status})`,
      );
    }
    const mediaInfo = (await mediaInfoRes.json()) as { url?: string };
    if (!mediaInfo.url) {
      throw new Error(
        `Meta no devolvió una URL de descarga para el media ${mediaId}`,
      );
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);

    try {
      const fileRes = await fetch(mediaInfo.url, {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: controller.signal,
      });
      if (!fileRes.ok || !fileRes.body) {
        throw new Error(
          `No se pudo descargar el media ${mediaId} (status ${fileRes.status})`,
        );
      }

      const contentLength = Number(
        fileRes.headers.get('content-length') ?? '0',
      );
      if (contentLength > MAX_MEDIA_BYTES) {
        throw new Error(
          `Media ${mediaId} excede el límite de 16MB (content-length: ${contentLength})`,
        );
      }

      const buffer = Buffer.from(await fileRes.arrayBuffer());
      if (buffer.byteLength > MAX_MEDIA_BYTES) {
        throw new Error(
          `Media ${mediaId} excede el límite de 16MB (${buffer.byteLength} bytes descargados)`,
        );
      }

      await fs.writeFile(destPath, buffer);
    } finally {
      clearTimeout(timeout);
    }
  }
}
