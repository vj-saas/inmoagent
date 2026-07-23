import { randomBytes } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as argon2 from 'argon2';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Spec A.1 (specs/A1-auth-personas/spec.md) — guard de personas y
 * aislamiento multi-tenant (AC-12 a AC-15). Este es el área clasificada
 * como crítica en CLAUDE.md, así que se prueba con su propio archivo.
 *
 * Rutas cubiertas (mismo contrato que auth-people-management.e2e-spec.ts):
 *  - POST /admin/tenants/:tenantId/people/bootstrap-owner (X-Master-Key)
 *  - POST /auth/login                                     (público)
 *  - GET  /admin/tenants/:tenantId/people                 (Authorization: Bearer <token>, guard de personas)
 *  - POST /admin/tenants/:tenantId/people                 (idem, para probar creación cross-tenant)
 *
 * Ninguna de estas rutas existe todavía: HOY se espera 404 en la mayoría de
 * los casos hasta que la fase de implementación las cree.
 */

interface PersonResponseBody {
  tenantId: string;
  email: string;
}

interface PeopleListResponseBody {
  people: PersonResponseBody[];
}

interface LoginResponseBody {
  token: string;
}

describe('Auth: guard de personas y aislamiento multi-tenant (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const masterKey = process.env.ADMIN_MASTER_KEY ?? 'dev-admin-master-key';
  const suffix = randomBytes(4).toString('hex');
  const tenantIds: string[] = [];

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    await app.close();
  });

  async function createTenant(label: string) {
    const tenant = await prisma.tenant.create({
      data: {
        name: `Isolation Tenant ${label}`,
        slug: `auth-isolation-${label.toLowerCase()}-${suffix}`,
        phoneNumberId: `auth-isolation-phone-${label.toLowerCase()}-${suffix}`,
        accessTokenEnc: 'irrelevante-para-este-test',
        apiKeyHash: await argon2.hash(`irrelevant-api-key-${label}-${suffix}`),
      },
    });
    tenantIds.push(tenant.id);
    return tenant;
  }

  function bootstrapOwner(
    tenantId: string,
    email: string,
    password = 'password123',
  ) {
    return request(app.getHttpServer())
      .post(`/admin/tenants/${tenantId}/people/bootstrap-owner`)
      .set('X-Master-Key', masterKey)
      .send({ email, password });
  }

  function login(email: string, password = 'password123') {
    return request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password });
  }

  async function setupTenantWithOwner(label: string) {
    const tenant = await createTenant(label);
    const email = `owner-${label.toLowerCase()}-${suffix}@test.com`;
    await bootstrapOwner(tenant.id, email, 'password123');
    const loginRes = await login(email, 'password123');
    const loginBody = loginRes.body as Partial<LoginResponseBody>;
    const token: string = loginBody.token ?? 'no-token';
    return { tenant, ownerEmail: email, ownerToken: token };
  }

  function listPeople(tenantId: string, token?: string) {
    const req = request(app.getHttpServer()).get(
      `/admin/tenants/${tenantId}/people`,
    );
    return token ? req.set('Authorization', `Bearer ${token}`) : req;
  }

  it('AC-12: sin sesión válida (ausente o malformada/inválida) el guard responde 401 sin ejecutar el endpoint', async () => {
    const { tenant } = await setupTenantWithOwner('no-session');

    await listPeople(tenant.id).expect(401); // sesión ausente

    await request(app.getHttpServer())
      .get(`/admin/tenants/${tenant.id}/people`)
      .set('Authorization', 'Bearer esto-no-es-un-token-valido')
      .expect(401); // malformada/inválida — proxy determinista del caso "expirada",
    // que no se puede simular sin esperar la duración real de la sesión.
  });

  it('AC-13: con una sesión válida, el guard resuelve la persona y su tenantId antes de ejecutar la lógica del endpoint', async () => {
    const { tenant, ownerToken } =
      await setupTenantWithOwner('resolve-identity');

    const res = await listPeople(tenant.id, ownerToken).expect(200);
    const people = (res.body as PeopleListResponseBody).people;
    expect(people.every((p) => p.tenantId === tenant.id)).toBe(true);
  });

  it('AC-14: una sesión de tenant A no puede leer datos scopeados a tenant B (403), sin filtrar nada de B', async () => {
    const { ownerToken: tokenA } = await setupTenantWithOwner('cross-a');
    const { tenant: tenantB, ownerEmail: emailB } =
      await setupTenantWithOwner('cross-b');

    await listPeople(tenantB.id, tokenA).expect(403);

    // El listado legítimo de B (para verificar que no fue afectado) sigue
    // mostrando solo lo suyo.
    const loginB = await login(emailB, 'password123').expect(200);
    const tokenB = (loginB.body as LoginResponseBody).token;
    const listB = await listPeople(tenantB.id, tokenB).expect(200);
    const emailsB = (listB.body as PeopleListResponseBody).people.map(
      (p) => p.email,
    );
    expect(emailsB).toContain(emailB.toLowerCase());
  });

  it('AC-15: la sesión de tenant A jamás permite escribir datos bajo la URL de tenant B (403), sin crear nada allí', async () => {
    const { ownerToken: tokenA } = await setupTenantWithOwner('write-a');
    const { tenant: tenantB, ownerEmail: emailB } =
      await setupTenantWithOwner('write-b');
    const leakedEmail = `leaked-${suffix}@test.com`;

    await request(app.getHttpServer())
      .post(`/admin/tenants/${tenantB.id}/people`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ email: leakedEmail, role: 'AGENT' })
      .expect(403);

    const loginB = await login(emailB, 'password123').expect(200);
    const tokenB = (loginB.body as LoginResponseBody).token;
    const listB = await listPeople(tenantB.id, tokenB).expect(200);
    const emailsB = (listB.body as PeopleListResponseBody).people.map(
      (p) => p.email,
    );
    expect(emailsB).not.toContain(leakedEmail.toLowerCase());
  });
});
