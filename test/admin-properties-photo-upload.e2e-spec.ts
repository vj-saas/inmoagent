import { randomBytes } from 'node:crypto';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';

/**
 * UPLOADS_DIR se fija ANTES de importar `AppModule`/`ConfigModule`: el schema de
 * env se valida cuando el módulo se compila (dentro de `beforeAll`), y dotenv no
 * pisa variables ya presentes en `process.env`. Así el e2e escribe en un
 * directorio temporal propio y nunca en `./uploads` del repo.
 */
const UPLOADS_DIR = mkdtempSync(join(tmpdir(), 'agente-inmo-uploads-e2e-'));
process.env.UPLOADS_DIR = UPLOADS_DIR;

import { Test, TestingModule } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Spec V-D (specs/V-D-portal-propiedades) — T19: e2e dedicado a la subida de
 * fotos de propiedades y, sobre todo, al **aislamiento multi-tenant por
 * filesystem** (AC-19), que es la segunda superficie de aislamiento del sistema
 * además de la DB.
 *
 * Cubre:
 *  - AC-17: jpeg válido → 201 con URL bajo PUBLIC_BASE_URL, archivo en
 *    `<UPLOADS_DIR>/properties/<tenantId>/`, y GET de esa URL → 200 con
 *    `Content-Type: image/jpeg`.
 *  - AC-18: PDF renombrado a `.jpg` → 400 sin escribir nada; archivo de 6 MB →
 *    rechazo (413 de multer, ver nota abajo) sin escribir nada.
 *  - AC-19: dos tenants suben el MISMO contenido con el MISMO nombre de archivo
 *    del lado del cliente → subdirectorios distintos, nombres distintos, ningún
 *    archivo pisado, y la ruta de B no es inferible desde la de A.
 *  - AC-13 aplicado al upload: sesión del tenant A contra el `:tenantId` de B
 *    (manipulación de ruta) → 403 antes de escribir nada en disco.
 *
 * Nota sobre el 413: `FileInterceptor` con `limits.fileSize` aborta dentro del
 * interceptor (MulterError LIMIT_FILE_SIZE → PayloadTooLargeException), así que
 * un archivo de más de 5 MB sale 413 y no 400. Es el desvío ya aprobado en el
 * plan; lo que AC-18 exige de fondo (rechazo + nada en disco) se verifica igual.
 */

interface LoginResponseBody {
  token: string;
}

interface CreateTenantResponseBody {
  tenantId: string;
  apiKey: string;
}

interface StoredPhotoBody {
  url: string;
  relativePath: string;
}

describe('Admin: upload de fotos de propiedades y aislamiento multi-tenant (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;

  const masterKey = process.env.ADMIN_MASTER_KEY ?? 'dev-admin-master-key';
  const publicBaseUrl = (
    process.env.PUBLIC_BASE_URL ?? 'http://localhost:3000'
  ).replace(/\/+$/, '');
  const suffix = randomBytes(4).toString('hex');
  const KNOWN_PASSWORD = 'password123';
  /** Mismo nombre de archivo del lado del cliente para A y para B (AC-19). */
  const CLIENT_FILE_NAME = 'foto.jpg';

  const tenantIds: string[] = [];

  let tenantA: string;
  let apiKeyA: string;
  let ownerTokenA: string;
  let agentTokenA: string;

  let tenantB: string;
  let ownerTokenB: string;

  /** JPEG mínimo válido: magic bytes reales + relleno + marcador de fin. */
  function jpegBuffer(padding = 64): Buffer {
    return Buffer.concat([
      Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]),
      Buffer.alloc(padding, 0x2a),
      Buffer.from([0xff, 0xd9]),
    ]);
  }

  function tenantPhotoDir(tenantId: string): string {
    return join(UPLOADS_DIR, 'properties', tenantId);
  }

  /** Archivos guardados para un tenant; `[]` si el directorio ni siquiera existe. */
  async function listTenantPhotos(tenantId: string): Promise<string[]> {
    try {
      return (await readdir(tenantPhotoDir(tenantId))).sort();
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  function uploadUrl(tenantId: string): string {
    return `/admin/tenants/${tenantId}/properties/photos`;
  }

  /** Path servible por `useStaticAssets` a partir de la URL pública devuelta. */
  function publicPath(url: string): string {
    expect(url.startsWith(`${publicBaseUrl}/`)).toBe(true);
    return url.slice(publicBaseUrl.length);
  }

  async function createTenant(
    label: string,
  ): Promise<CreateTenantResponseBody> {
    const res = await request(app.getHttpServer())
      .post('/admin/tenants')
      .set('X-Master-Key', masterKey)
      .send({
        name: `Photo Upload Tenant ${label}`,
        slug: `photo-upload-${label}-${suffix}`,
        phoneNumberId: `photo-upload-phone-${label}-${suffix}`,
        accessToken: 'meta-token-plano',
      })
      .expect(201);
    const body = res.body as CreateTenantResponseBody;
    tenantIds.push(body.tenantId);
    return body;
  }

  async function loginToken(email: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: KNOWN_PASSWORD })
      .expect(200);
    return (res.body as LoginResponseBody).token;
  }

  async function bootstrapOwnerAndLogin(
    tenantId: string,
    localPart: string,
  ): Promise<string> {
    const email = `${localPart}@test.com`;
    await request(app.getHttpServer())
      .post(`/admin/tenants/${tenantId}/people/bootstrap-owner`)
      .set('X-Master-Key', masterKey)
      .send({ email, password: KNOWN_PASSWORD })
      .expect(201);
    return loginToken(email);
  }

  async function createAgentAndLogin(
    tenantId: string,
    ownerToken: string,
    localPart: string,
  ): Promise<string> {
    const email = `${localPart}@test.com`;
    await request(app.getHttpServer())
      .post(`/admin/tenants/${tenantId}/people`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ email, role: 'AGENT', password: KNOWN_PASSWORD })
      .expect(201);
    return loginToken(email);
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication<NestExpressApplication>();

    // Mismo registro de estáticos que `main.ts` (helmet, que en main va antes,
    // no cambia el ruteo de /uploads/ y no hace falta acá para estos AC).
    app.useStaticAssets(UPLOADS_DIR, {
      prefix: '/uploads/',
      index: false,
      dotfiles: 'ignore',
      redirect: false,
      maxAge: '30d',
      immutable: true,
    });

    await app.init();
    prisma = app.get(PrismaService);

    const setupA = await createTenant('a');
    tenantA = setupA.tenantId;
    apiKeyA = setupA.apiKey;
    const setupB = await createTenant('b');
    tenantB = setupB.tenantId;

    ownerTokenA = await bootstrapOwnerAndLogin(
      tenantA,
      `photo-owner-a-${suffix}`,
    );
    agentTokenA = await createAgentAndLogin(
      tenantA,
      ownerTokenA,
      `photo-agent-a-${suffix}`,
    );
    ownerTokenB = await bootstrapOwnerAndLogin(
      tenantB,
      `photo-owner-b-${suffix}`,
    );
  });

  afterAll(async () => {
    await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    await app.close();
    rmSync(UPLOADS_DIR, { recursive: true, force: true });
  });

  describe('AC-17: jpeg válido se guarda y se sirve por la URL pública', () => {
    it('OWNER sube un jpeg → 201, archivo bajo <UPLOADS_DIR>/properties/<tenantId>/ y GET de la URL devuelve image/jpeg', async () => {
      const content = jpegBuffer();

      const res = await request(app.getHttpServer())
        .post(uploadUrl(tenantA))
        .set('Authorization', `Bearer ${ownerTokenA}`)
        .attach('file', content, CLIENT_FILE_NAME)
        .expect(201);
      const stored = res.body as StoredPhotoBody;

      // URL pública armada con PUBLIC_BASE_URL (nunca con el header Host).
      expect(stored.url).toBe(
        `${publicBaseUrl}/uploads/properties/${tenantA}/${basename(stored.relativePath)}`,
      );
      expect(stored.relativePath).toBe(
        `properties/${tenantA}/${basename(stored.relativePath)}`,
      );

      // El archivo existe realmente en el subdirectorio del tenant.
      const files = await listTenantPhotos(tenantA);
      expect(files).toEqual([basename(stored.relativePath)]);
      expect(existsSync(join(tenantPhotoDir(tenantA), files[0]))).toBe(true);

      // El nombre lo genera el server (uuid + extensión del tipo real): el
      // nombre que mandó el cliente no aparece en ningún lado de la ruta.
      expect(stored.relativePath).not.toContain(CLIENT_FILE_NAME);
      expect(files[0]).toMatch(/^[0-9a-f-]{36}\.jpg$/i);

      // Y se sirve por la URL pública con el Content-Type correcto.
      const served = await request(app.getHttpServer())
        .get(publicPath(stored.url))
        .expect(200);
      expect(served.headers['content-type']).toContain('image/jpeg');
      expect(Buffer.from(served.body as Buffer).equals(content)).toBe(true);
    });

    it('AGENT también puede subir fotos (estos endpoints no imponen rol adicional)', async () => {
      const res = await request(app.getHttpServer())
        .post(uploadUrl(tenantA))
        .set('Authorization', `Bearer ${agentTokenA}`)
        .attach('file', jpegBuffer(32), CLIENT_FILE_NAME)
        .expect(201);
      const stored = res.body as StoredPhotoBody;

      expect(stored.url.startsWith(`${publicBaseUrl}/uploads/`)).toBe(true);
      await request(app.getHttpServer())
        .get(publicPath(stored.url))
        .expect(200);
    });
  });

  describe('AC-18: archivos rechazados no llegan al disco', () => {
    // Todos los rechazos se prueban contra el tenant B, que hasta este punto no
    // tiene ni un solo archivo: así "directorio vacío" es una aserción literal.
    it('un PDF renombrado a .jpg → 400 y el directorio del tenant queda vacío', async () => {
      const pdf = Buffer.concat([
        Buffer.from('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n', 'binary'),
        Buffer.from('1 0 obj << /Type /Catalog >> endobj\n%%EOF\n', 'utf-8'),
      ]);

      await request(app.getHttpServer())
        .post(uploadUrl(tenantB))
        .set('Authorization', `Bearer ${ownerTokenB}`)
        .attach('file', pdf, {
          filename: 'documento.jpg',
          contentType: 'image/jpeg',
        })
        .expect(400);

      expect(await listTenantPhotos(tenantB)).toEqual([]);
    });

    it('un archivo de 6 MB es rechazado (413 de multer) y el directorio del tenant queda vacío', async () => {
      // JPEG válido por magic bytes pero de 6 MB: lo único que lo rechaza es el
      // límite de tamaño, no el sniff.
      const oversized = jpegBuffer(6 * 1024 * 1024);

      const res = await request(app.getHttpServer())
        .post(uploadUrl(tenantB))
        .set('Authorization', `Bearer ${ownerTokenB}`)
        .attach('file', oversized, CLIENT_FILE_NAME);

      // 413 es el desvío aprobado en el plan: multer aborta en el interceptor,
      // antes de que corra el handler. 400 sería igual de aceptable si algún día
      // se agrega un filter que lo remapee; lo innegociable es el rechazo.
      expect([400, 413]).toContain(res.status);
      expect(await listTenantPhotos(tenantB)).toEqual([]);
    });

    it('un request sin archivo → 400 y nada en disco', async () => {
      await request(app.getHttpServer())
        .post(uploadUrl(tenantB))
        .set('Authorization', `Bearer ${ownerTokenB}`)
        .expect(400);

      expect(await listTenantPhotos(tenantB)).toEqual([]);
    });
  });

  describe('AC-19: dos tenants suben la MISMA imagen con el MISMO nombre', () => {
    it('cada uno queda en su subdirectorio, con nombre distinto, sin pisarse, y la ruta de B no es inferible desde la de A', async () => {
      const content = jpegBuffer(128);

      const before = {
        a: await listTenantPhotos(tenantA),
        b: await listTenantPhotos(tenantB),
      };
      expect(before.b).toEqual([]);

      const resA = await request(app.getHttpServer())
        .post(uploadUrl(tenantA))
        .set('Authorization', `Bearer ${ownerTokenA}`)
        .attach('file', content, CLIENT_FILE_NAME)
        .expect(201);
      const storedA = resA.body as StoredPhotoBody;

      const resB = await request(app.getHttpServer())
        .post(uploadUrl(tenantB))
        .set('Authorization', `Bearer ${ownerTokenB}`)
        .attach('file', content, CLIENT_FILE_NAME)
        .expect(201);
      const storedB = resB.body as StoredPhotoBody;

      // 1. Subdirectorios distintos, uno por tenant.
      expect(dirname(storedA.relativePath)).toBe(`properties/${tenantA}`);
      expect(dirname(storedB.relativePath)).toBe(`properties/${tenantB}`);
      expect(dirname(storedA.relativePath)).not.toBe(
        dirname(storedB.relativePath),
      );

      // 2. Nombres de archivo distintos (uuid por subida), pese a contenido y
      //    nombre de cliente idénticos.
      const nameA = basename(storedA.relativePath);
      const nameB = basename(storedB.relativePath);
      expect(nameA).not.toBe(nameB);
      expect(nameA).toMatch(/^[0-9a-f-]{36}\.jpg$/i);
      expect(nameB).toMatch(/^[0-9a-f-]{36}\.jpg$/i);

      // 3. Ningún archivo pisado: cada directorio sumó exactamente uno y los
      //    previos siguen ahí.
      const afterA = await listTenantPhotos(tenantA);
      const afterB = await listTenantPhotos(tenantB);
      expect(afterA).toEqual([...before.a, nameA].sort());
      expect(afterB).toEqual([nameB]);
      expect(existsSync(join(tenantPhotoDir(tenantA), nameA))).toBe(true);
      expect(existsSync(join(tenantPhotoDir(tenantB), nameB))).toBe(true);

      // 4. Desde la URL/ruta de A no se puede inferir ni construir la de B.
      //    (a) La URL de A no menciona en ningún lado al tenant B.
      expect(storedA.url).not.toContain(tenantB);
      expect(storedA.relativePath).not.toContain(tenantB);
      //    (b) Cambiar el tenantId en la ruta de A no da la ruta de B: el nombre
      //        del archivo es un uuid independiente, no derivado del contenido
      //        ni del nombre del cliente.
      const guessedPath = storedA.url.replace(tenantA, tenantB);
      expect(guessedPath).not.toBe(storedB.url);
      expect(existsSync(join(tenantPhotoDir(tenantB), nameA))).toBe(false);
      await request(app.getHttpServer())
        .get(publicPath(guessedPath))
        .expect(404);
      //    (c) Y el nombre tampoco se puede derivar del contenido: mismo byte a
      //        byte, nombres distintos (nada de hash del archivo como nombre).
      expect(nameA).not.toBe(nameB);

      // 5. Ambos archivos conservan el contenido original, servido por su URL.
      for (const stored of [storedA, storedB]) {
        const served = await request(app.getHttpServer())
          .get(publicPath(stored.url))
          .expect(200);
        expect(Buffer.from(served.body as Buffer).equals(content)).toBe(true);
      }
    });
  });

  describe('AC-13 sobre el upload: manipulación del :tenantId de la ruta', () => {
    it('sesión del tenant A contra el :tenantId de B → 403 y nada escrito en el directorio de B', async () => {
      const beforeB = await listTenantPhotos(tenantB);

      for (const token of [ownerTokenA, agentTokenA]) {
        await request(app.getHttpServer())
          .post(uploadUrl(tenantB))
          .set('Authorization', `Bearer ${token}`)
          .attach('file', jpegBuffer(), CLIENT_FILE_NAME)
          .expect(403);
      }

      // El guard corre ANTES del interceptor de multer y del handler: el
      // directorio de B queda exactamente como estaba.
      expect(await listTenantPhotos(tenantB)).toEqual(beforeB);
    });

    it('la API key de A contra el :tenantId de B → 401 y nada escrito', async () => {
      const beforeB = await listTenantPhotos(tenantB);

      await request(app.getHttpServer())
        .post(uploadUrl(tenantB))
        .set('X-Api-Key', apiKeyA)
        .attach('file', jpegBuffer(), CLIENT_FILE_NAME)
        .expect(401);

      expect(await listTenantPhotos(tenantB)).toEqual(beforeB);
    });

    it('sin credenciales → 401 y nada escrito', async () => {
      const beforeB = await listTenantPhotos(tenantB);

      await request(app.getHttpServer())
        .post(uploadUrl(tenantB))
        .attach('file', jpegBuffer(), CLIENT_FILE_NAME)
        .expect(401);

      expect(await listTenantPhotos(tenantB)).toEqual(beforeB);
    });

    it('un :tenantId inexistente o con path traversal es rechazado sin crear directorios', async () => {
      const hostiles = [
        randomBytes(12).toString('hex'), // cuid-like inexistente
        '..%2F..%2Fetc',
        'no-es-un-cuid',
      ];

      for (const hostile of hostiles) {
        const res = await request(app.getHttpServer())
          .post(uploadUrl(hostile))
          .set('Authorization', `Bearer ${ownerTokenA}`)
          .attach('file', jpegBuffer(), CLIENT_FILE_NAME);
        expect([400, 403, 404]).toContain(res.status);
      }

      // Nada se creó fuera de `properties/`, ni ningún directorio de tenant
      // nuevo dentro suyo.
      expect((await readdir(UPLOADS_DIR)).sort()).toEqual(['properties']);
      expect((await readdir(join(UPLOADS_DIR, 'properties'))).sort()).toEqual(
        [tenantA, tenantB].sort(),
      );
    });
  });
});
