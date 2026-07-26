import { randomBytes } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { OperationType, PropertyStatus } from '@prisma/client';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { PropertySearchService } from '../src/properties/property-search.service';

/**
 * T18 (specs/V-D-portal-propiedades/tasks.md) — E2E de CRUD, filtros, estado,
 * borrado, permisos y CSV. Patrón calcado de `test/admin-properties.e2e-spec.ts`
 * (dos tenants + API key) pero agregando sesión de OWNER/AGENT (patrón de
 * `test/admin-guard-composite.e2e-spec.ts`) para los casos de permisos y
 * cross-tenant.
 */

interface PropertyResponseBody {
  id: string;
  title?: string;
  price?: string | number;
  status?: PropertyStatus;
  operation?: OperationType;
  neighborhood?: string;
  rooms?: number;
  photos?: Array<{ id: string; url: string; position: number }>;
}
interface PropertyListResponseBody {
  properties: PropertyResponseBody[];
  total: number;
}
interface CreateTenantResponseBody {
  tenantId: string;
  apiKey: string;
}
interface LoginResponseBody {
  token: string;
}
interface ImportResponseBody {
  imported: number;
  errors: Array<{ row: number; message: string }>;
}

describe('Admin: portal de propiedades — CRUD/filtros/estado/borrado/permisos/CSV (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let propertySearch: PropertySearchService;
  const masterKey = process.env.ADMIN_MASTER_KEY ?? 'dev-admin-master-key';
  const suffix = randomBytes(4).toString('hex');
  const KNOWN_PASSWORD = 'password123';

  const tenantIds: string[] = [];
  let tenantA: string;
  let apiKeyA: string;
  let ownerTokenA: string;
  let agentTokenA: string;

  let tenantB: string;
  let apiKeyB: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    propertySearch = app.get(PropertySearchService);

    const setupA = await setupTenant('a');
    tenantA = setupA.tenantId;
    apiKeyA = setupA.apiKey;
    const setupB = await setupTenant('b');
    tenantB = setupB.tenantId;
    apiKeyB = setupB.apiKey;

    ownerTokenA = await bootstrapOwnerAndLogin(tenantA, `owner-a-${suffix}`);
    agentTokenA = await createAgentAndLogin(
      tenantA,
      ownerTokenA,
      `agent-a-${suffix}`,
    );
  });

  afterAll(async () => {
    await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    await app.close();
  });

  async function setupTenant(label: string): Promise<CreateTenantResponseBody> {
    const res = await request(app.getHttpServer())
      .post('/admin/tenants')
      .set('X-Master-Key', masterKey)
      .send({
        name: `Portal Tenant ${label}`,
        slug: `admin-props-portal-${label}-${suffix}`,
        phoneNumberId: `admin-props-portal-phone-${label}-${suffix}`,
        accessToken: 'meta-token-plano',
      })
      .expect(201);
    const body = res.body as CreateTenantResponseBody;
    tenantIds.push(body.tenantId);
    return body;
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

  async function loginToken(email: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: KNOWN_PASSWORD })
      .expect(200);
    return (res.body as LoginResponseBody).token;
  }

  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
  const propertiesUrl = (tenantId: string) =>
    `/admin/tenants/${tenantId}/properties`;

  async function createProperty(
    tenantId: string,
    apiKey: string,
    overrides: Record<string, unknown> = {},
  ): Promise<PropertyResponseBody> {
    const res = await request(app.getHttpServer())
      .post(propertiesUrl(tenantId))
      .set('X-Api-Key', apiKey)
      .send({
        title: `Depto genérico ${randomBytes(3).toString('hex')}`,
        operation: 'RENT',
        propertyType: 'departamento',
        price: 100000,
        neighborhood: 'caballito',
        rooms: 2,
        ...overrides,
      })
      .expect(201);
    return res.body as PropertyResponseBody;
  }

  describe('1. Listado con filtros (AC-1, AC-2)', () => {
    const tag = `filtros-${suffix}`;
    let matchAll: PropertyResponseBody;

    beforeAll(async () => {
      // Match exacto para todos los filtros combinados.
      matchAll = await createProperty(tenantA, apiKeyA, {
        title: `Palermo Deluxe ${tag}`,
        operation: 'SALE',
        price: 150000,
        neighborhood: 'Palermo Sóho', // tilde + mayúsculas: debe normalizar a "palermo"
        rooms: 3,
        status: undefined,
      });

      // Falla cada filtro por separado, para que la combinación excluya a todas.
      await createProperty(tenantA, apiKeyA, {
        title: `Otro barrio ${tag}`,
        operation: 'SALE',
        price: 150000,
        neighborhood: 'belgrano',
        rooms: 3,
      });
      await createProperty(tenantA, apiKeyA, {
        title: `Otra operacion ${tag}`,
        operation: 'RENT',
        price: 150000,
        neighborhood: 'palermo',
        rooms: 3,
      });
      await createProperty(tenantA, apiKeyA, {
        title: `Precio bajo ${tag}`,
        operation: 'SALE',
        price: 50000,
        neighborhood: 'palermo',
        rooms: 3,
      });
      await createProperty(tenantA, apiKeyA, {
        title: `Precio alto ${tag}`,
        operation: 'SALE',
        price: 500000,
        neighborhood: 'palermo',
        rooms: 3,
      });
      await createProperty(tenantA, apiKeyA, {
        title: `Otros ambientes ${tag}`,
        operation: 'SALE',
        price: 150000,
        neighborhood: 'palermo',
        rooms: 1,
      });
      // Ninguna propiedad de B debe aparecer nunca en los resultados de A.
      await createProperty(tenantB, apiKeyB, {
        title: `Palermo Deluxe ${tag}`,
        operation: 'SALE',
        price: 150000,
        neighborhood: 'palermo',
        rooms: 3,
      });
    });

    async function listA(query: Record<string, unknown>) {
      const res = await request(app.getHttpServer())
        .get(propertiesUrl(tenantA))
        .query(query)
        .set('X-Api-Key', apiKeyA)
        .expect(200);
      return res.body as PropertyListResponseBody;
    }

    it('filtra por status', async () => {
      const paused = await createProperty(tenantA, apiKeyA, {
        title: `Pausada status ${tag}`,
      });
      await request(app.getHttpServer())
        .patch(`${propertiesUrl(tenantA)}/${paused.id}/status`)
        .set('X-Api-Key', apiKeyA)
        .send({ status: 'PAUSED' })
        .expect(200);

      const body = await listA({ status: 'PAUSED' });
      expect(body.properties.every((p) => p.status === 'PAUSED')).toBe(true);
      expect(body.properties.some((p) => p.id === paused.id)).toBe(true);
    });

    it('filtra por operation', async () => {
      const body = await listA({ operation: 'RENT', q: tag });
      expect(body.properties.every((p) => p.operation === 'RENT')).toBe(true);
      expect(
        body.properties.some((p) => p.title === `Otra operacion ${tag}`),
      ).toBe(true);
      expect(body.properties.some((p) => p.title === `Palermo Deluxe ${tag}`)).toBe(
        false,
      );
    });

    it('filtra por neighborhood con distinta capitalización y tilde (normaliza igual que create)', async () => {
      const body = await listA({ neighborhood: 'PALERMO', q: tag });
      expect(
        body.properties.every((p) => p.neighborhood === 'palermo'),
      ).toBe(true);
      expect(body.properties.some((p) => p.id === matchAll.id)).toBe(true);
    });

    it('filtra por minPrice/maxPrice', async () => {
      const body = await listA({ minPrice: 100000, maxPrice: 200000, q: tag });
      expect(
        body.properties.every(
          (p) => Number(p.price) >= 100000 && Number(p.price) <= 200000,
        ),
      ).toBe(true);
      expect(body.properties.some((p) => p.title === `Precio bajo ${tag}`)).toBe(
        false,
      );
      expect(body.properties.some((p) => p.title === `Precio alto ${tag}`)).toBe(
        false,
      );
    });

    it('filtra por rooms exacto', async () => {
      const body = await listA({ rooms: 3, q: tag });
      expect(body.properties.every((p) => p.rooms === 3)).toBe(true);
      expect(
        body.properties.some((p) => p.title === `Otros ambientes ${tag}`),
      ).toBe(false);
    });

    it('filtra por q (título), insensible a mayúsculas', async () => {
      const body = await listA({ q: `palermo deluxe ${tag}`.toUpperCase() });
      expect(body.properties.some((p) => p.id === matchAll.id)).toBe(true);
    });

    it('combinación de todos los filtros: solo la propiedad que cumple TODAS las condiciones, ninguna de B', async () => {
      const body = await listA({
        operation: 'SALE',
        neighborhood: 'Pálermo',
        minPrice: 100000,
        maxPrice: 200000,
        rooms: 3,
        q: tag,
      });
      expect(body.properties.map((p) => p.id)).toEqual([matchAll.id]);
    });

    it('el listado de A nunca incluye propiedades de B', async () => {
      const body = await listA({ q: tag });
      // Ningún id de B aparece en el listado de A, aunque comparta título/tag.
      const propsB = await prisma.property.findMany({
        where: { tenantId: tenantB, title: { contains: tag } },
        select: { id: true },
      });
      const idsB = new Set(propsB.map((p) => p.id));
      expect(body.properties.some((p) => idsB.has(p.id))).toBe(false);
    });
  });

  describe('2. Alta (AC-4, AC-5, AC-12)', () => {
    it('alta válida -> 201 y aparece en el listado', async () => {
      const title = `Alta valida ${suffix}`;
      const created = await createProperty(tenantA, apiKeyA, { title });
      expect(created.id).toBeDefined();

      const list = await request(app.getHttpServer())
        .get(propertiesUrl(tenantA))
        .query({ q: title })
        .set('X-Api-Key', apiKeyA)
        .expect(200);
      const body = list.body as PropertyListResponseBody;
      expect(body.properties.some((p) => p.id === created.id)).toBe(true);
    });

    it('price negativo -> 400 y no crea nada', async () => {
      const title = `Precio negativo ${suffix}`;
      await request(app.getHttpServer())
        .post(propertiesUrl(tenantA))
        .set('X-Api-Key', apiKeyA)
        .send({
          title,
          operation: 'RENT',
          propertyType: 'departamento',
          price: -100,
          neighborhood: 'caballito',
        })
        .expect(400);

      const found = await prisma.property.findFirst({ where: { title } });
      expect(found).toBeNull();
    });

    it('sin title -> 400 y no crea nada', async () => {
      const externalRef = `sin-title-${suffix}`;
      await request(app.getHttpServer())
        .post(propertiesUrl(tenantA))
        .set('X-Api-Key', apiKeyA)
        .send({
          externalRef,
          operation: 'RENT',
          propertyType: 'departamento',
          price: 100000,
          neighborhood: 'caballito',
        })
        .expect(400);

      const found = await prisma.property.findFirst({
        where: { tenantId: tenantA, externalRef },
      });
      expect(found).toBeNull();
    });

    it('photoUrl malformada -> 400 y no crea nada', async () => {
      const title = `Foto malformada ${suffix}`;
      await request(app.getHttpServer())
        .post(propertiesUrl(tenantA))
        .set('X-Api-Key', apiKeyA)
        .send({
          title,
          operation: 'RENT',
          propertyType: 'departamento',
          price: 100000,
          neighborhood: 'caballito',
          photoUrls: ['no-es-una-url'],
        })
        .expect(400);

      const found = await prisma.property.findFirst({ where: { title } });
      expect(found).toBeNull();
    });
  });

  describe('3. externalRef duplicado (AC-6)', () => {
    it('409 y la propiedad existente queda intacta', async () => {
      const externalRef = `dup-ref-${suffix}`;
      const first = await createProperty(tenantA, apiKeyA, {
        title: 'Original',
        externalRef,
      });

      await request(app.getHttpServer())
        .post(propertiesUrl(tenantA))
        .set('X-Api-Key', apiKeyA)
        .send({
          title: 'Intento duplicado',
          operation: 'RENT',
          propertyType: 'departamento',
          price: 999999,
          neighborhood: 'belgrano',
          externalRef,
        })
        .expect(409);

      const stillThere = await prisma.property.findUnique({
        where: { id: first.id },
      });
      expect(stillThere).not.toBeNull();
      expect(stillThere!.title).toBe('Original');
      expect(Number(stillThere!.price)).toBe(100000);
    });
  });

  describe('4. PATCH parcial + fotos reordenadas (AC-7, AC-11)', () => {
    it('PATCH parcial solo cambia lo enviado', async () => {
      const created = await createProperty(tenantA, apiKeyA, {
        title: 'Antes del patch',
        price: 111111,
        rooms: 2,
      });

      const patched = await request(app.getHttpServer())
        .patch(`${propertiesUrl(tenantA)}/${created.id}`)
        .set('X-Api-Key', apiKeyA)
        .send({ title: 'Después del patch' })
        .expect(200);
      const body = patched.body as PropertyResponseBody;

      expect(body.title).toBe('Después del patch');
      expect(Number(body.price)).toBe(111111);
      expect(body.rooms).toBe(2);
    });

    it('PATCH con photoUrls reordenado refleja el nuevo orden en position', async () => {
      const created = await createProperty(tenantA, apiKeyA, {
        title: 'Con fotos',
        photoUrls: [
          'https://example.com/foto-1.jpg',
          'https://example.com/foto-2.jpg',
        ],
      });

      const patched = await request(app.getHttpServer())
        .patch(`${propertiesUrl(tenantA)}/${created.id}`)
        .set('X-Api-Key', apiKeyA)
        .send({
          photoUrls: [
            'https://example.com/foto-2.jpg',
            'https://example.com/foto-1.jpg',
          ],
        })
        .expect(200);
      const body = patched.body as PropertyResponseBody;

      const sorted = [...body.photos!].sort((a, b) => a.position - b.position);
      expect(sorted.map((p) => p.url)).toEqual([
        'https://example.com/foto-2.jpg',
        'https://example.com/foto-1.jpg',
      ]);
      expect(sorted[0].position).toBe(0);
      expect(sorted[1].position).toBe(1);
    });
  });

  describe('5. PATCH :id/status + PropertySearchService (AC-8)', () => {
    const statuses: PropertyStatus[] = [
      PropertyStatus.PAUSED,
      PropertyStatus.RESERVED,
      PropertyStatus.SOLD_OR_RENTED,
    ];

    it.each(statuses)('%s deja de aparecer en la búsqueda', async (status) => {
      // Normalizado a minúsculas: `create` normaliza el barrio, y la
      // búsqueda compara contra ese valor ya normalizado.
      const neighborhood =
        `estado-${status}-${randomBytes(3).toString('hex')}`.toLowerCase();
      const created = await createProperty(tenantA, apiKeyA, {
        title: `Buscable ${status}`,
        neighborhood,
        operation: 'RENT',
        price: 100000,
        rooms: 2,
      });

      // Antes del cambio de estado: aparece en la búsqueda.
      const before = await propertySearch.search(tenantA, {
        operation: OperationType.RENT,
        neighborhoods: [neighborhood],
        maxPrice: 200000,
        currency: null,
        minRooms: null,
        garage: null,
        petsAllowed: null,
      });
      expect(before.properties.some((p) => p.id === created.id)).toBe(true);

      await request(app.getHttpServer())
        .patch(`${propertiesUrl(tenantA)}/${created.id}/status`)
        .set('X-Api-Key', apiKeyA)
        .send({ status })
        .expect(200);

      const after = await propertySearch.search(tenantA, {
        operation: OperationType.RENT,
        neighborhoods: [neighborhood],
        maxPrice: 200000,
        currency: null,
        minRooms: null,
        garage: null,
        petsAllowed: null,
      });
      expect(after.properties.some((p) => p.id === created.id)).toBe(false);
    });
  });

  describe('6. DELETE sin/con citas (AC-9, AC-10)', () => {
    it('DELETE sin citas -> 200 y PropertyPhoto borradas por cascada', async () => {
      const created = await createProperty(tenantA, apiKeyA, {
        title: 'Para borrar',
        photoUrls: ['https://example.com/foto-a.jpg'],
      });
      expect(created.photos!.length).toBeGreaterThan(0);

      await request(app.getHttpServer())
        .delete(`${propertiesUrl(tenantA)}/${created.id}`)
        .set('X-Api-Key', apiKeyA)
        .expect(200);

      const gone = await prisma.property.findUnique({ where: { id: created.id } });
      expect(gone).toBeNull();
      const photos = await prisma.propertyPhoto.findMany({
        where: { propertyId: created.id },
      });
      expect(photos).toHaveLength(0);
    });

    it('DELETE con Appointment asociado -> 409, propiedad y cita siguen existiendo', async () => {
      const created = await createProperty(tenantA, apiKeyA, {
        title: 'Con cita agendada',
      });
      const lead = await prisma.lead.create({
        data: {
          tenantId: tenantA,
          phone: `54911${randomBytes(4).toString('hex')}`,
        },
      });
      const appointment = await prisma.appointment.create({
        data: {
          tenantId: tenantA,
          leadId: lead.id,
          propertyId: created.id,
          status: 'PROPOSED',
        },
      });

      await request(app.getHttpServer())
        .delete(`${propertiesUrl(tenantA)}/${created.id}`)
        .set('X-Api-Key', apiKeyA)
        .expect(409);

      const stillProperty = await prisma.property.findUnique({
        where: { id: created.id },
      });
      const stillAppointment = await prisma.appointment.findUnique({
        where: { id: appointment.id },
      });
      expect(stillProperty).not.toBeNull();
      expect(stillAppointment).not.toBeNull();
    });
  });

  describe('7. Cross-tenant (AC-13)', () => {
    let propB: PropertyResponseBody;

    beforeAll(async () => {
      propB = await createProperty(tenantB, apiKeyB, {
        title: `Propiedad ajena ${suffix}`,
      });
    });

    it('GET :propertyId bajo la URL de A con id de B -> 404 (no cruza tenant vía id)', async () => {
      await request(app.getHttpServer())
        .get(`${propertiesUrl(tenantA)}/${propB.id}`)
        .set(bearer(ownerTokenA))
        .expect(404);
    });

    it('GET propiedades bajo la URL de B con sesión de A -> 403 (TenantScopeGuard)', async () => {
      const res = await request(app.getHttpServer())
        .get(propertiesUrl(tenantB))
        .set(bearer(ownerTokenA))
        .expect(403);
      expect(JSON.stringify(res.body)).not.toContain(propB.title);
    });

    it('PATCH bajo la URL de B con sesión de A -> 403 y la propiedad de B no muta', async () => {
      const before = await prisma.property.findUnique({ where: { id: propB.id } });
      await request(app.getHttpServer())
        .patch(`${propertiesUrl(tenantB)}/${propB.id}`)
        .set(bearer(ownerTokenA))
        .send({ title: 'Hackeada' })
        .expect(403);
      const after = await prisma.property.findUnique({ where: { id: propB.id } });
      expect(after!.title).toBe(before!.title);
    });

    it('PATCH status bajo la URL de B con sesión de A -> 403 y el estado de B no cambia', async () => {
      const before = await prisma.property.findUnique({ where: { id: propB.id } });
      await request(app.getHttpServer())
        .patch(`${propertiesUrl(tenantB)}/${propB.id}/status`)
        .set(bearer(ownerTokenA))
        .send({ status: 'PAUSED' })
        .expect(403);
      const after = await prisma.property.findUnique({ where: { id: propB.id } });
      expect(after!.status).toBe(before!.status);
    });

    it('DELETE bajo la URL de B con sesión de A -> 403 y la propiedad de B sigue existiendo', async () => {
      await request(app.getHttpServer())
        .delete(`${propertiesUrl(tenantB)}/${propB.id}`)
        .set(bearer(ownerTokenA))
        .expect(403);
      const after = await prisma.property.findUnique({ where: { id: propB.id } });
      expect(after).not.toBeNull();
    });
  });

  describe('8. Los 6 verbos con sesión de AGENT: mismos códigos que OWNER (AC-14)', () => {
    it('GET listado -> 200', async () => {
      await request(app.getHttpServer())
        .get(propertiesUrl(tenantA))
        .set(bearer(agentTokenA))
        .expect(200);
    });

    it('GET uno -> 200', async () => {
      const created = await createProperty(tenantA, apiKeyA, {
        title: 'Para agente',
      });
      await request(app.getHttpServer())
        .get(`${propertiesUrl(tenantA)}/${created.id}`)
        .set(bearer(agentTokenA))
        .expect(200);
    });

    it('POST crear -> 201', async () => {
      await request(app.getHttpServer())
        .post(propertiesUrl(tenantA))
        .set(bearer(agentTokenA))
        .send({
          title: `Creada por agente ${suffix}`,
          operation: 'RENT',
          propertyType: 'departamento',
          price: 100000,
          neighborhood: 'caballito',
        })
        .expect(201);
    });

    it('PATCH -> 200', async () => {
      const created = await createProperty(tenantA, apiKeyA, {
        title: 'A editar por agente',
      });
      await request(app.getHttpServer())
        .patch(`${propertiesUrl(tenantA)}/${created.id}`)
        .set(bearer(agentTokenA))
        .send({ title: 'Editada por agente' })
        .expect(200);
    });

    it('PATCH status -> 200', async () => {
      const created = await createProperty(tenantA, apiKeyA, {
        title: 'A pausar por agente',
      });
      await request(app.getHttpServer())
        .patch(`${propertiesUrl(tenantA)}/${created.id}/status`)
        .set(bearer(agentTokenA))
        .send({ status: 'PAUSED' })
        .expect(200);
    });

    it('DELETE -> 200', async () => {
      const created = await createProperty(tenantA, apiKeyA, {
        title: 'A borrar por agente',
      });
      await request(app.getHttpServer())
        .delete(`${propertiesUrl(tenantA)}/${created.id}`)
        .set(bearer(agentTokenA))
        .expect(200);
    });
  });

  describe('9. Import CSV: contrato sin cambios (AC-15, AC-16)', () => {
    it('devuelve { imported, errors[] } con el mismo formato de hoy', async () => {
      const header =
        'external_ref,title,description,operation,property_type,price,currency,expenses,neighborhood,city,address,rooms,bedrooms,bathrooms,area_m2,garage,pets_allowed,features,listing_url,photo_urls';
      const row = `csv-portal-${suffix},Depto CSV,desc,alquiler,departamento,300000,ARS,,caballito,CABA,,2,1,1,45,si,no,balcon,,`;
      const csv = `${header}\n${row}`;

      const res = await request(app.getHttpServer())
        .post(`${propertiesUrl(tenantA)}/import`)
        .set('X-Api-Key', apiKeyA)
        .attach('file', Buffer.from(csv, 'utf-8'), 'inventario.csv')
        .expect(200);
      const body = res.body as ImportResponseBody;

      expect(body).toEqual(
        expect.objectContaining({
          imported: expect.any(Number),
          errors: expect.any(Array),
        }),
      );
      expect(body.imported).toBe(1);
      expect(body.errors).toHaveLength(0);
    });
  });
});
