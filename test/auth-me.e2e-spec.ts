import { randomBytes } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as argon2 from 'argon2';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Spec A.2 (specs/A2-frontend-base/spec.md) — AC-20: GET /auth/me devuelve la
 * identidad de la persona autenticada (id, role, tenantId, email) resuelta
 * desde la sesión vigente, sin recibir tenant en la URL y sin alterar el
 * contrato de POST /auth/login.
 */

interface MeResponseBody {
  id: string;
  role: 'OWNER' | 'AGENT';
  tenantId: string;
  email: string;
  passwordHash?: unknown;
  token?: unknown;
}

interface LoginResponseBody {
  token: string;
}

describe('Auth: GET /auth/me (e2e)', () => {
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
        name: `Auth Me Tenant ${label}`,
        slug: `auth-me-${label.toLowerCase()}-${suffix}`,
        phoneNumberId: `auth-me-phone-${label.toLowerCase()}-${suffix}`,
        accessTokenEnc: 'irrelevante-para-este-test',
        apiKeyHash: await argon2.hash(`irrelevant-api-key-${label}-${suffix}`),
      },
    });
    tenantIds.push(tenant.id);
    return tenant;
  }

  function bootstrapOwner(tenantId: string, email: string, password: string) {
    return request(app.getHttpServer())
      .post(`/admin/tenants/${tenantId}/people/bootstrap-owner`)
      .set('X-Master-Key', masterKey)
      .send({ email, password });
  }

  function login(email: string, password: string) {
    return request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password });
  }

  it('AC-20: con sesión válida devuelve 200 con id, role, tenantId y email', async () => {
    const tenant = await createTenant('me-ok');
    const email = `me-ok-${suffix}@test.com`;
    await bootstrapOwner(tenant.id, email, 'password123').expect(201);

    const loginRes = await login(email, 'password123').expect(200);
    const { token } = loginRes.body as LoginResponseBody;

    const res = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const body = res.body as MeResponseBody;
    expect(body).toEqual({
      id: expect.any(String),
      role: 'OWNER',
      tenantId: tenant.id,
      email: email.toLowerCase(),
    });
    // Nunca debe filtrar secretos.
    expect(body.passwordHash).toBeUndefined();
    expect(body.token).toBeUndefined();
    expect(JSON.stringify(body)).not.toMatch(/passwordHash|\$argon2/i);
  });

  it('AC-20: sin header de sesión responde 401', async () => {
    await request(app.getHttpServer()).get('/auth/me').expect(401);
  });

  it('AC-20: con token de sesión inválido responde 401', async () => {
    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', 'Bearer token-que-no-existe')
      .expect(401);
  });
});
