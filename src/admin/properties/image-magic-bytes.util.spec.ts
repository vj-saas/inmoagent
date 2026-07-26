import { sniffImageType } from './image-magic-bytes.util';

function riffBuffer(format: string): Buffer {
  // RIFF + tamaño (4 bytes, valor arbitrario) + formato (4 ASCII) — igual al
  // header real de WAV/AVI/WEBP, que comparten el contenedor RIFF.
  return Buffer.concat([
    Buffer.from('RIFF', 'ascii'),
    Buffer.from([0x00, 0x00, 0x00, 0x00]),
    Buffer.from(format, 'ascii'),
  ]);
}

describe('sniffImageType', () => {
  it('detecta jpeg por FF D8 FF', () => {
    const buffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    expect(sniffImageType(buffer)).toBe('jpeg');
  });

  it('detecta png por la cabecera de 8 bytes', () => {
    const buffer = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
    ]);
    expect(sniffImageType(buffer)).toBe('png');
  });

  it('detecta webp por RIFF (offset 0) + WEBP (offset 8)', () => {
    const buffer = riffBuffer('WEBP');
    expect(sniffImageType(buffer)).toBe('webp');
  });

  it('distingue un RIFF que es WAV (no WEBP) — no alcanza con RIFF solo', () => {
    const buffer = riffBuffer('WAVE');
    expect(sniffImageType(buffer)).toBeNull();
  });

  it('rechaza un PDF', () => {
    const buffer = Buffer.from('%PDF-1.4\n%âãÏÓ', 'utf-8');
    expect(sniffImageType(buffer)).toBeNull();
  });

  it('rechaza un SVG (XML, texto plano)', () => {
    const buffer = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>', 'utf-8');
    expect(sniffImageType(buffer)).toBeNull();
  });

  it('rechaza un HTML', () => {
    const buffer = Buffer.from('<!DOCTYPE html><html></html>', 'utf-8');
    expect(sniffImageType(buffer)).toBeNull();
  });

  it('rechaza un ZIP', () => {
    const buffer = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]);
    expect(sniffImageType(buffer)).toBeNull();
  });

  it('rechaza un buffer vacío', () => {
    expect(sniffImageType(Buffer.alloc(0))).toBeNull();
  });

  it('rechaza un buffer de 3 bytes (más corto que cualquier magic number)', () => {
    const buffer = Buffer.from([0x00, 0x01, 0x02]);
    expect(sniffImageType(buffer)).toBeNull();
  });

  it('caso adversario: detecta png a partir únicamente del buffer, sin importar nombre/extensión', () => {
    // La función no recibe nombre de archivo — este test documenta que la
    // detección es 100% por contenido: un buffer con cabecera PNG real se
    // clasifica como 'png' sin importar cómo se llame o qué extensión tenga
    // el archivo del que provino (ver T5: el nombre original nunca se usa
    // para derivar el tipo ni la extensión guardada).
    const pngHeaderWithTrailingJunk = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.from('esto-podria-llamarse-cualquier-cosa.exe', 'utf-8'),
    ]);
    expect(sniffImageType(pngHeaderWithTrailingJunk)).toBe('png');
  });
});
