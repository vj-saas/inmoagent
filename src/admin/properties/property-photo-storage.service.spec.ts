import { BadRequestException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { EnvConfig } from '../../config/env.schema';
import {
  MAX_PHOTO_BYTES,
  PropertyPhotoStorageService,
  assertSafeTenantId,
} from './property-photo-storage.service';
import type { UploadedPhotoFile } from './property-photo-storage.service';

const PUBLIC_BASE_URL = 'https://app.example.com';

const TENANT_A = 'clzz00000000000000000a';
const TENANT_B = 'clzz00000000000000000b';

/** JPEG mínimo: magic bytes reales + relleno. */
function jpegBuffer(padding = 16): Buffer {
  return Buffer.concat([
    Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
    Buffer.alloc(padding, 0x41),
  ]);
}

function pngBuffer(): Buffer {
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.alloc(16, 0x42),
  ]);
}

/** Directorio temporal REAL: este test valida I/O de filesystem, no mocks. */
let uploadsDir: string;
let service: PropertyPhotoStorageService;

function buildService(dir: string): PropertyPhotoStorageService {
  const config = {
    get: (key: keyof EnvConfig) => {
      if (key === 'UPLOADS_DIR') {
        return dir;
      }
      if (key === 'PUBLIC_BASE_URL') {
        return PUBLIC_BASE_URL;
      }
      throw new Error(`env no esperada en el test: ${String(key)}`);
    },
  } as unknown as ConfigService<EnvConfig, true>;
  return new PropertyPhotoStorageService(config);
}

async function listRecursive(dir: string): Promise<string[]> {
  const entries = await readdir(dir, {
    recursive: true,
    withFileTypes: true,
  });
  return entries.filter((entry) => entry.isFile()).map((entry) => entry.name);
}

beforeEach(async () => {
  uploadsDir = await mkdtemp(join(tmpdir(), 'agente-inmo-uploads-'));
  service = buildService(uploadsDir);
});

afterEach(async () => {
  await rm(uploadsDir, { recursive: true, force: true });
});

describe('assertSafeTenantId', () => {
  it.each(['../otro', 'a/b', '', '..', 'clzz0000/../otro00000', 'corto'])(
    'rechaza %p sin tocar el filesystem',
    async (tenantId) => {
      expect(() => assertSafeTenantId(tenantId)).toThrow(BadRequestException);

      // Ninguna llamada a través del service debe crear directorios.
      await expect(
        service.save(tenantId, { buffer: jpegBuffer(), size: 20 }),
      ).rejects.toBeInstanceOf(BadRequestException);

      await expect(readdir(uploadsDir)).resolves.toEqual([]);
    },
  );

  it('acepta un cuid con forma válida', () => {
    expect(() => assertSafeTenantId(TENANT_A)).not.toThrow();
  });
});

describe('PropertyPhotoStorageService.save', () => {
  it('guarda la foto bajo el subdirectorio del tenant y devuelve URL pública', async () => {
    const buffer = jpegBuffer();
    const result = await service.save(TENANT_A, {
      buffer,
      size: buffer.length,
    });

    expect(result.relativePath).toMatch(
      new RegExp(`^properties/${TENANT_A}/[0-9a-f-]{36}\\.jpg$`),
    );
    expect(result.url).toBe(
      `${PUBLIC_BASE_URL}/uploads/${result.relativePath}`,
    );

    const onDisk = await readFile(
      join(uploadsDir, ...result.relativePath.split('/')),
    );
    expect(onDisk.equals(buffer)).toBe(true);
  });

  it('aísla tenants: directorios y nombres distintos, no adivinables entre sí (AC-19)', async () => {
    const buffer = jpegBuffer();
    const a = await service.save(TENANT_A, { buffer, size: buffer.length });
    const b = await service.save(TENANT_B, { buffer, size: buffer.length });

    expect(a.relativePath).toContain(`properties/${TENANT_A}/`);
    expect(b.relativePath).toContain(`properties/${TENANT_B}/`);
    expect(a.relativePath).not.toEqual(b.relativePath);

    const nameA = a.relativePath.split('/').pop();
    const nameB = b.relativePath.split('/').pop();
    // El nombre de uno no se deriva del otro ni del tenantId.
    expect(nameA).not.toEqual(nameB);
    expect(nameA).not.toContain(TENANT_A);
    expect(nameB).not.toContain(TENANT_B);

    // Cada archivo vive únicamente en el directorio de su tenant.
    await expect(
      listRecursive(join(uploadsDir, 'properties', TENANT_A)),
    ).resolves.toEqual([nameA]);
    await expect(
      listRecursive(join(uploadsDir, 'properties', TENANT_B)),
    ).resolves.toEqual([nameB]);
  });

  it('dos subidas del mismo tenant no se pisan entre sí', async () => {
    const buffer = jpegBuffer();
    const first = await service.save(TENANT_A, { buffer, size: buffer.length });
    const second = await service.save(TENANT_A, {
      buffer,
      size: buffer.length,
    });

    expect(first.relativePath).not.toEqual(second.relativePath);
    await expect(
      listRecursive(join(uploadsDir, 'properties', TENANT_A)),
    ).resolves.toHaveLength(2);
  });

  it('ignora por completo el nombre original del archivo', async () => {
    const buffer = jpegBuffer();
    // El nombre original ni siquiera es parte del contrato del service; se
    // manda igual (como lo haría multer) para demostrar que no influye.
    const file: UploadedPhotoFile & { originalname: string } = {
      buffer,
      size: buffer.length,
      originalname: '../../etc/passwd.jpg',
    };
    const result = await service.save(TENANT_A, file);

    expect(result.relativePath).not.toContain('passwd');
    expect(result.relativePath).not.toContain('..');
    expect(result.url).not.toContain('passwd');
    expect(result.url).not.toContain('..');

    const files = await listRecursive(uploadsDir);
    expect(files).toHaveLength(1);
    expect(files[0]).not.toContain('passwd');
  });

  it('deriva la extensión del tipo detectado, no del nombre recibido', async () => {
    const buffer = pngBuffer();
    const result = await service.save(TENANT_A, {
      buffer,
      size: buffer.length,
    });
    expect(result.relativePath.endsWith('.png')).toBe(true);
  });

  it('normaliza la barra final de PUBLIC_BASE_URL', async () => {
    const configWithSlash = {
      get: (key: keyof EnvConfig) =>
        key === 'UPLOADS_DIR' ? uploadsDir : `${PUBLIC_BASE_URL}/`,
    } as unknown as ConfigService<EnvConfig, true>;
    const withSlash = new PropertyPhotoStorageService(configWithSlash);

    const buffer = jpegBuffer();
    const result = await withSlash.save(TENANT_A, {
      buffer,
      size: buffer.length,
    });

    expect(result.url.startsWith(`${PUBLIC_BASE_URL}/uploads/`)).toBe(true);
    expect(result.url).not.toContain('//uploads');
    // Ninguna barra duplicada después del esquema.
    expect(result.url.slice('https://'.length)).not.toContain('//');
  });

  it('rechaza (400) un archivo que no es imagen por contenido real y no escribe nada (AC-18)', async () => {
    const notAnImage = Buffer.from('%PDF-1.7 no soy una imagen', 'utf-8');

    await expect(
      service.save(TENANT_A, { buffer: notAnImage, size: notAnImage.length }),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(readdir(uploadsDir)).resolves.toEqual([]);
  });

  it('rechaza (400) un archivo que supera 5 MB y no escribe nada (AC-18)', async () => {
    const buffer = jpegBuffer();

    await expect(
      service.save(TENANT_A, { buffer, size: MAX_PHOTO_BYTES + 1 }),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(readdir(uploadsDir)).resolves.toEqual([]);
  });

  it('rechaza (400) un archivo vacío sin escribir nada', async () => {
    await expect(
      service.save(TENANT_A, { buffer: Buffer.alloc(0), size: 0 }),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(readdir(uploadsDir)).resolves.toEqual([]);
  });
});
