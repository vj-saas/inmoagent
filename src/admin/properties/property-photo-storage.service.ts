import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import type { EnvConfig } from '../../config/env.schema';
import { sniffImageType } from './image-magic-bytes.util';
import type { SniffedImageType } from './image-magic-bytes.util';

/** 5 MB. Tope de tamaño de una foto de propiedad (también aplicado por multer). */
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

/** Prefijo público bajo el que `useStaticAssets` sirve `UPLOADS_DIR`. */
const PUBLIC_UPLOADS_PREFIX = 'uploads';

/** Subdirectorio de `UPLOADS_DIR` donde viven las fotos de propiedades. */
const PROPERTIES_SUBDIR = 'properties';

/**
 * Forma de un cuid de Prisma. Deliberadamente restrictiva: el `tenantId` viene
 * de la URL y se usa como componente de path, así que solo se aceptan
 * alfanuméricos (ni `.`, ni `/`, ni `\`, ni bytes nulos).
 */
const SAFE_TENANT_ID = /^[a-z0-9]{20,40}$/i;

const EXTENSION_BY_TYPE: Record<SniffedImageType, string> = {
  jpeg: 'jpg',
  png: 'png',
  webp: 'webp',
};

export interface UploadedPhotoFile {
  buffer: Buffer;
  size: number;
}

export interface StoredPhoto {
  /** URL pública absoluta, armada con `PUBLIC_BASE_URL`. */
  url: string;
  /** Ruta relativa a `UPLOADS_DIR`, siempre con `/` como separador. */
  relativePath: string;
}

/**
 * Valida que `tenantId` tenga forma de cuid antes de usarlo como componente de
 * path. Es la segunda superficie de aislamiento multi-tenant (la primera es la
 * DB): un `tenantId` con `..` o `/` permitiría escribir o pisar archivos de
 * otro tenant. No toca el filesystem: se llama siempre antes de cualquier
 * `mkdir`/`writeFile`.
 */
export function assertSafeTenantId(tenantId: string): void {
  if (typeof tenantId !== 'string' || !SAFE_TENANT_ID.test(tenantId)) {
    throw new BadRequestException('Identificador de inmobiliaria inválido');
  }
}

@Injectable()
export class PropertyPhotoStorageService {
  constructor(private readonly config: ConfigService<EnvConfig, true>) {}

  /**
   * Guarda una foto de propiedad bajo `UPLOADS_DIR/properties/<tenantId>/`.
   * El nombre se genera server-side (`randomUUID` + extensión del tipo real
   * detectado por magic bytes): el nombre original que manda el cliente no se
   * usa ni se persiste en ningún lado.
   */
  async save(tenantId: string, file: UploadedPhotoFile): Promise<StoredPhoto> {
    // 1. Validación del tenant ANTES de tocar el filesystem.
    assertSafeTenantId(tenantId);

    // 2. Tamaño (defensa redundante al `limits` del interceptor).
    if (!Number.isFinite(file.size) || file.size <= 0) {
      throw new BadRequestException('El archivo está vacío');
    }
    if (file.size > MAX_PHOTO_BYTES) {
      throw new BadRequestException('La foto supera el máximo de 5 MB');
    }

    // 3. Tipo real por contenido, no por extensión ni por Content-Type.
    const detected = sniffImageType(file.buffer);
    if (detected === null) {
      throw new BadRequestException(
        'El archivo no es una imagen válida (se aceptan JPEG, PNG o WebP)',
      );
    }

    // 4. Nombre generado server-side: no adivinable y sin datos del usuario.
    const fileName = `${randomUUID()}.${EXTENSION_BY_TYPE[detected]}`;

    // 5. Escritura bajo el subdirectorio del tenant.
    const uploadsDir = resolve(this.config.get('UPLOADS_DIR', { infer: true }));
    const tenantDir = join(uploadsDir, PROPERTIES_SUBDIR, tenantId);
    const absolutePath = join(tenantDir, fileName);

    // Cinturón y tiradores: aunque `assertSafeTenantId` ya lo garantiza, se
    // verifica que la ruta final no se escape del directorio del tenant.
    if (!absolutePath.startsWith(tenantDir + sep)) {
      throw new BadRequestException('Ruta de archivo inválida');
    }

    await mkdir(tenantDir, { recursive: true });
    await writeFile(absolutePath, file.buffer);

    // 6. URL pública con `PUBLIC_BASE_URL` (nunca con el header `Host`, que lo
    // controla el cliente).
    const relativePath = `${PROPERTIES_SUBDIR}/${tenantId}/${fileName}`;
    const baseUrl = this.config
      .get('PUBLIC_BASE_URL', { infer: true })
      .replace(/\/+$/, '');

    return {
      url: `${baseUrl}/${PUBLIC_UPLOADS_PREFIX}/${relativePath}`,
      relativePath,
    };
  }
}
