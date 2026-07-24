import { randomBytes } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as argon2 from 'argon2';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Tarea T9 (specs/A4-ficha-lead/tasks.md) — endpoint
 * `GET /admin/tenants/:tenantId/people/assignable`: fuente de personas para
 * poblar el selector de asignación de leads. Accesible a ambos roles (OWNER
 * y AGENT) con sesión válida, a diferencia del listado OWNER-only existente
 * (`GET /admin/tenants/:tenantId/people`).
 */

interface AssignableUser {
  id: string;
  email: string;
  role: 'OWNER' | 'AGENT';
}

interface AssignableResponseBody {
  users: AssignableUser[];
}

interface PersonResponseBody {
  id: string;
  tenantId: string;
  email: string;
  role: 'OWNER' | 'AGENT';
  active: boolean;
  temporaryPassword?: string;
}

interface LoginResponseBody {
  token: string;
}

describe('Auth: personas asignables de un tenant (e2e)', () => {
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
        name: `People Assignable Tenant ${label}`,
        slug: `people-assignable-${label.toLowerCase()}-${suffix}`,
        phoneNumberId: `people-assignable-phone-${label.toLowerCase()}-${suffix}`,
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

  function createPerson(
    tenantId: string,
    token: string,
    payload: { email: string; role: 'OWNER' | 'AGENT'; password?: string },
  ) {
    return request(app.getHttpServer())
      .post(`/admin/tenants/${tenantId}/people`)
      .set('Authorization', `Bearer ${token}`)
      .send(payload);
  }

  function deactivatePerson(tenantId: string, token: string, personId: string) {
    return request(app.getHttpServer())
      .patch(`/admin/tenants/${tenantId}/people/${personId}/deactivate`)
      .set('Authorization', `Bearer ${token}`);
  }

  function listAssignable(tenantId: string, token: string) {
    return request(app.getHttpServer())
      .get(`/admin/tenants/${tenantId}/people/assignable`)
      .set('Authorization', `Bearer ${token}`);
  }

  function listPeople(tenantId: string, token: string) {
    return request(app.getHttpServer())
      .get(`/admin/tenants/${tenantId}/people`)
      .set('Authorization', `Bearer ${token}`);
  }

  it('un AGENT con sesión válida puede listar personas asignables de su tenant (200), a diferencia del listado OWNER-only (403)', async () => {
    const { tenant, ownerToken } = await setupTenantWithOwner('agent-ok');
    const agentEmail = `agent-assignable-${suffix}@test.com`;
    const createRes = await createPerson(tenant.id, ownerToken, {
      email: agentEmail,
      role: 'AGENT',
      password: 'password123',
    }).expect(201);
    void createRes;

    const agentLogin = await login(agentEmail, 'password123').expect(200);
    const agentToken = (agentLogin.body as LoginResponseBody).token;

    const res = await listAssignable(tenant.id, agentToken).expect(200);
    const body = res.body as AssignableResponseBody;
    expect(body.users.some((u) => u.email === agentEmail.toLowerCase())).toBe(
      true,
    );

    await listPeople(tenant.id, agentToken).expect(403);
  });

  it('solo devuelve personas activas (excluye a una desactivada)', async () => {
    const { tenant, ownerToken } = await setupTenantWithOwner('active-only');
    const toDeactivateEmail = `to-deactivate-assignable-${suffix}@test.com`;
    const createRes = await createPerson(tenant.id, ownerToken, {
      email: toDeactivateEmail,
      role: 'AGENT',
      password: 'password123',
    }).expect(201);
    const personId = (createRes.body as PersonResponseBody).id;

    await deactivatePerson(tenant.id, ownerToken, personId).expect(200);

    const res = await listAssignable(tenant.id, ownerToken).expect(200);
    const body = res.body as AssignableResponseBody;
    expect(
      body.users.some((u) => u.email === toDeactivateEmail.toLowerCase()),
    ).toBe(false);
  });

  it('una sesión del tenant A contra :tenantId del tenant B responde 403 sin exponer datos de B', async () => {
    const { ownerToken: tokenA } = await setupTenantWithOwner('cross-a');
    const { tenant: tenantB } = await setupTenantWithOwner('cross-b');

    const res = await listAssignable(tenantB.id, tokenA);
    expect(res.status).toBe(403);
    expect(JSON.stringify(res.body)).not.toContain(tenantB.id);
  });
});
