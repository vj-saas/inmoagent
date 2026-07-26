/**
 * Sniff del tipo real de archivo a partir de sus "magic bytes", sin depender
 * de la extensión/nombre (que el usuario controla y no es confiable). No
 * agrega la dependencia `file-type` porque el conjunto de formatos soportado
 * es acotado (solo fotos de propiedades: jpeg/png/webp) y la detección cabe
 * en unas pocas comparaciones de bytes.
 */
export type SniffedImageType = 'jpeg' | 'png' | 'webp';

const JPEG_MAGIC = [0xff, 0xd8, 0xff];
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const RIFF_ASCII = [0x52, 0x49, 0x46, 0x46]; // "RIFF"
const WEBP_ASCII = [0x57, 0x45, 0x42, 0x50]; // "WEBP"

function matches(buffer: Buffer, magic: number[], offset = 0): boolean {
  if (buffer.length < offset + magic.length) {
    return false;
  }
  for (let i = 0; i < magic.length; i++) {
    if (buffer[offset + i] !== magic[i]) {
      return false;
    }
  }
  return true;
}

export function sniffImageType(buffer: Buffer): SniffedImageType | null {
  if (matches(buffer, JPEG_MAGIC)) {
    return 'jpeg';
  }

  if (matches(buffer, PNG_MAGIC)) {
    return 'png';
  }

  if (matches(buffer, RIFF_ASCII, 0) && matches(buffer, WEBP_ASCII, 8)) {
    return 'webp';
  }

  return null;
}
