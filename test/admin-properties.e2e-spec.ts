import { randomBytes } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

const CSV_HEADER =
  'external_ref,title,description,operation,property_type,price,currency,expenses,neighborhood,city,address,rooms,bedrooms,bathrooms,area_m2,garage,pets_allowed,features,listing_url,photo_urls';

interface PropertyResponseBody {
  id: string;
  status?: string;
}
interface PropertyListResponseBody {
  properties: Array<{ id: string }>;
}
interface ImportResponseBody {
  imported: number;
  errors: Array<{ row: number; message: string }>;
}
interface CreateTenantResponseBody {
  tenantId: string;
  apiKey: string;
}

describe('Admin: tenants + properties (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const masterKey = process.env.ADMIN_MASTER_KEY ?? 'dev-admin-master-key';
  const suffix = randomBytes(4).toString('hex');
  let tenantA: { id: string; apiKey: string };
  let tenantB: { id: string; apiKey: string };

  function validCsvRow(ref: string): string {
    return `${ref},Depto ${ref},desc,alquiler,departamento,300000,ARS,,caballito,CABA,,2,1,1,45,si,no,balcon,,`;
  }

  async function createTenant(label: string) {
    const response = await request(app.getHttpServer())
      .post('/admin/tenants')
      .set('X-Master-Key', masterKey)
      .send({
        name: `Tenant ${label}`,
        slug: `admin-props-${label.toLowerCase()}-${suffix}`,
        phoneNumberId: `admin-props-phone-${label.toLowerCase()}-${suffix}`,
        accessToken: 'meta-token-plano',
      })
      .expect(201);
    const body = response.body as CreateTenantResponseBody;
    return { id: body.tenantId, apiKey: body.apiKey };
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);

    tenantA = await createTenant('A');
    tenantB = await createTenant('B');
  });

  afterAll(async () => {
    await prisma.tenant.deleteMany({
      where: { id: { in: [tenantA.id, tenantB.id] } },
    });
    await app.close();
  });

  it('POST /admin/tenants sin X-Master-Key responde 401 y no crea nada', async () => {
    await request(app.getHttpServer())
      .post('/admin/tenants')
      .send({
        name: 'X',
        slug: `no-auth-${suffix}`,
        phoneNumberId: `no-auth-phone-${suffix}`,
        accessToken: 't',
      })
      .expect(401);

    const found = await prisma.tenant.findUnique({
      where: { slug: `no-auth-${suffix}` },
    });
    expect(found).toBeNull();
  });

  it('la API key de un tenant no puede leer/crear datos de otro tenant', async () => {
    const propertyBRes = await request(app.getHttpServer())
      .post(`/admin/tenants/${tenantB.id}/properties`)
      .set('X-Api-Key', tenantB.apiKey)
      .send({
        title: 'Propiedad de B',
        operation: 'RENT',
        propertyType: 'departamento',
        price: 100000,
        neighborhood: 'palermo',
      })
      .expect(201);
    const propertyB = propertyBRes.body as PropertyResponseBody;

    // La API key de A no sirve para autenticar en la URL de B.
    await request(app.getHttpServer())
      .get(`/admin/tenants/${tenantB.id}/properties`)
      .set('X-Api-Key', tenantA.apiKey)
      .expect(401);

    // Ni siquiera pidiendo el recurso puntual por id bajo la URL de B.
    await request(app.getHttpServer())
      .get(`/admin/tenants/${tenantB.id}/properties/${propertyB.id}`)
      .set('X-Api-Key', tenantA.apiKey)
      .expect(401);

    // El listado de A (con su propia key legítima) no incluye nada de B.
    const listA = await request(app.getHttpServer())
      .get(`/admin/tenants/${tenantA.id}/properties`)
      .set('X-Api-Key', tenantA.apiKey)
      .expect(200);
    const listABody = listA.body as PropertyListResponseBody;
    expect(listABody.properties.some((p) => p.id === propertyB.id)).toBe(false);

    // Ni siquiera pidiéndolo bajo su propia URL de tenant (scoping por tenantId en la query, no sólo por auth).
    await request(app.getHttpServer())
      .get(`/admin/tenants/${tenantA.id}/properties/${propertyB.id}`)
      .set('X-Api-Key', tenantA.apiKey)
      .expect(404);
  });

  it('import CSV de 50 filas con 3 inválidas -> 47 upserted + reporte de las 3', async () => {
    const rows = [CSV_HEADER];
    const invalidRows = new Set([10, 25, 40]);

    for (let i = 1; i <= 50; i++) {
      if (i === 10) {
        // operation inválida
        rows.push(
          `csv-${i}-${suffix},Título ${i},,invalida,departamento,100000,ARS,,caballito,,,,,,,,,,,`,
        );
      } else if (i === 25) {
        // falta external_ref
        rows.push(
          `,Título ${i},,alquiler,departamento,100000,ARS,,caballito,,,,,,,,,,,`,
        );
      } else if (i === 40) {
        // price inválido
        rows.push(
          `csv-${i}-${suffix},Título ${i},,alquiler,departamento,no-es-numero,ARS,,caballito,,,,,,,,,,,`,
        );
      } else {
        rows.push(validCsvRow(`csv-${i}-${suffix}`));
      }
    }
    const csv = rows.join('\n');

    const response = await request(app.getHttpServer())
      .post(`/admin/tenants/${tenantA.id}/properties/import`)
      .set('X-Api-Key', tenantA.apiKey)
      .attach('file', Buffer.from(csv, 'utf-8'), 'inventario.csv')
      .expect(200);
    const importResult = response.body as ImportResponseBody;

    expect(importResult.imported).toBe(50 - invalidRows.size);
    expect(importResult.errors).toHaveLength(invalidRows.size);
    expect(new Set(importResult.errors.map((e) => e.row))).toEqual(
      new Set([11, 26, 41]),
    ); // +1 por la fila de encabezado

    const imported = await prisma.property.findMany({
      where: { tenantId: tenantA.id, externalRef: { startsWith: `csv-1-` } },
    });
    expect(imported).not.toHaveLength(0);
  });

  it('PATCH .../status pausa una propiedad (endpoint crítico)', async () => {
    const created = await request(app.getHttpServer())
      .post(`/admin/tenants/${tenantA.id}/properties`)
      .set('X-Api-Key', tenantA.apiKey)
      .send({
        title: 'Para pausar',
        operation: 'SALE',
        propertyType: 'casa',
        price: 200000,
        neighborhood: 'belgrano',
      })
      .expect(201);
    const createdProperty = created.body as PropertyResponseBody;

    const updated = await request(app.getHttpServer())
      .patch(
        `/admin/tenants/${tenantA.id}/properties/${createdProperty.id}/status`,
      )
      .set('X-Api-Key', tenantA.apiKey)
      .send({ status: 'PAUSED' })
      .expect(200);
    const updatedProperty = updated.body as PropertyResponseBody;

    expect(updatedProperty.status).toBe('PAUSED');
  });

  it('GET .../metrics devuelve las métricas del rango pedido', async () => {
    const from = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const to = new Date().toISOString();

    const response = await request(app.getHttpServer())
      .get(`/admin/tenants/${tenantA.id}/metrics`)
      .query({ from, to })
      .set('X-Api-Key', tenantA.apiKey)
      .expect(200);

    expect(response.body).toEqual(
      expect.objectContaining({
        newLeads: expect.any(Number),
        activeConversations: expect.any(Number),
        handoffs: expect.any(Number),
        appointments: {
          proposed: expect.any(Number),
          confirmed: expect.any(Number),
        },
      }),
    );
  });
});
