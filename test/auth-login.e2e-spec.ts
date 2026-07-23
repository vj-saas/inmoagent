import { randomBytes } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as argon2 from 'argon2';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Spec A.1 (specs/A1-auth-personas/spec.md) — bootstrap del primer owner y
 * login de personas.
 *
 * Rutas cubiertas por este archivo (contrato propuesto para el `planner`;
 * puede ajustarse si encuentra una razón de diseño mejor, el comportamiento
 * de los AC es lo que manda):
 *  - POST /admin/tenants/:tenantId/people/bootstrap-owner   (header X-Master-Key)
 *  - POST /auth/login                                       (público, sin tenant en la ruta)
 *
 * Ninguna de las dos rutas existe todavía: HOY se espera 404 en la mayoría
 * de los casos hasta que la fase de implementación las cree.
 */

interface PersonResponseBody {
  id?: string;
  tenantId: string;
  email: string;
  role: 'OWNER' | 'AGENT';
  active: boolean;
  passwordHash?: unknown;
  password?: unknown;
}

interface LoginResponseBody {
  token: string;
}

interface ErrorResponseBody {
  message: string;
}

describe('Auth: bootstrap de owner y login (e2e)', () => {
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
        name: `Auth Login Tenant ${label}`,
        slug: `auth-login-${label.toLowerCase()}-${suffix}`,
        phoneNumberId: `auth-login-phone-${label.toLowerCase()}-${suffix}`,
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

  it('AC-5: bootstrap crea el primer owner activo de un tenant sin owners', async () => {
    const tenant = await createTenant('bootstrap-ok');
    const email = `owner-${suffix}@test.com`;

    const res = await bootstrapOwner(tenant.id, email, 'password123').expect(
      201,
    );
    const body = res.body as PersonResponseBody;

    expect(body).toEqual(
      expect.objectContaining({
        tenantId: tenant.id,
        email: email.toLowerCase(),
        role: 'OWNER',
        active: true,
      }),
    );
  });

  it('AC-6: bootstrap rechaza con 409 si el tenant ya tiene un owner activo', async () => {
    const tenant = await createTenant('bootstrap-dup');
    const email = `owner-dup-${suffix}@test.com`;
    await bootstrapOwner(tenant.id, email, 'password123').expect(201);

    await bootstrapOwner(
      tenant.id,
      `owner-dup-2-${suffix}@test.com`,
      'password123',
    ).expect(409);
  });

  it('AC-7: bootstrap sin master key responde 401 y no crea la cuenta', async () => {
    const tenant = await createTenant('bootstrap-no-key');
    const email = `owner-no-key-${suffix}@test.com`;

    await request(app.getHttpServer())
      .post(`/admin/tenants/${tenant.id}/people/bootstrap-owner`)
      .send({ email, password: 'password123' })
      .expect(401);

    // Si el intento anterior no creó nada, el bootstrap legítimo con la
    // misma combinación tenant+email todavía debería poder crear el primer owner.
    await bootstrapOwner(tenant.id, email, 'password123').expect(201);
  });

  it('AC-4: rechaza crear una persona con password de menos de 8 caracteres, sin crear el registro', async () => {
    const tenant = await createTenant('short-password');
    const email = `short-pw-${suffix}@test.com`;

    await bootstrapOwner(tenant.id, email, 'short1').expect(400);

    // Si no quedó creada, el mismo tenant+email debería poder bootstrapearse
    // de nuevo con una contraseña válida.
    await bootstrapOwner(tenant.id, email, 'password123').expect(201);
  });

  it('AC-1: la persona creada queda asociada a tenant, email, rol y estado activo (sin exponer el hash)', async () => {
    const tenant = await createTenant('fields');
    const email = `fields-${suffix}@test.com`;

    const res = await bootstrapOwner(tenant.id, email, 'password123').expect(
      201,
    );
    const body = res.body as PersonResponseBody;

    expect(body.tenantId).toBe(tenant.id);
    expect(body.email).toBe(email.toLowerCase());
    expect(body.role).toBe('OWNER');
    expect(body.active).toBe(true);
    expect(body.passwordHash).toBeUndefined();
    expect(body.password).toBeUndefined();
  });

  it('AC-2: normaliza el email a minúsculas (el login funciona con distinta capitalización)', async () => {
    const tenant = await createTenant('case-norm');
    const rawEmail = `Case-Norm-${suffix}@Test.com`;
    await bootstrapOwner(tenant.id, rawEmail, 'password123').expect(201);

    const res = await login(rawEmail.toLowerCase(), 'password123').expect(200);
    const body = res.body as LoginResponseBody;
    expect(body.token).toEqual(expect.any(String));
  });

  it('AC-3: ninguna respuesta de bootstrap o login expone el hash de la contraseña', async () => {
    const tenant = await createTenant('no-hash');
    const email = `no-hash-${suffix}@test.com`;

    const bootstrapRes = await bootstrapOwner(
      tenant.id,
      email,
      'password123',
    ).expect(201);
    expect(JSON.stringify(bootstrapRes.body)).not.toMatch(
      /passwordHash|\$argon2/i,
    );

    const loginRes = await login(email, 'password123').expect(200);
    expect(JSON.stringify(loginRes.body)).not.toMatch(/passwordHash|\$argon2/i);
  });

  it('AC-8: login con credenciales válidas de una persona y tenant activos responde 200 con una sesión', async () => {
    const tenant = await createTenant('login-ok');
    const email = `login-ok-${suffix}@test.com`;
    await bootstrapOwner(tenant.id, email, 'password123').expect(201);

    const res = await login(email, 'password123').expect(200);
    const body = res.body as LoginResponseBody;
    expect(body.token).toEqual(expect.any(String));
    expect(body.token.length).toBeGreaterThan(0);
  });

  it('AC-9: rechaza login con mensaje genérico si el email no existe o la contraseña no coincide', async () => {
    const tenant = await createTenant('login-bad');
    const email = `login-bad-${suffix}@test.com`;
    await bootstrapOwner(tenant.id, email, 'password123').expect(201);

    const unknownEmailRes = await login(
      `no-existe-${suffix}@test.com`,
      'password123',
    ).expect(401);
    const wrongPasswordRes = await login(email, 'password-incorrecta').expect(
      401,
    );
    const unknownEmailBody = unknownEmailRes.body as ErrorResponseBody;
    const wrongPasswordBody = wrongPasswordRes.body as ErrorResponseBody;

    expect(unknownEmailBody.message).toBeDefined();
    expect(wrongPasswordBody.message).toEqual(unknownEmailBody.message);
  });

  it('AC-10: rechaza login (401, mismo mensaje genérico que AC-9) si el tenant de la persona está inactivo', async () => {
    const tenant = await createTenant('tenant-inactive');
    const email = `tenant-inactive-${suffix}@test.com`;
    await bootstrapOwner(tenant.id, email, 'password123').expect(201);

    // Cuenta de referencia (tenant activo) con contraseña incorrecta, para
    // comparar el mensaje genérico contra el caso de tenant inactivo.
    const otherTenant = await createTenant('tenant-inactive-ref');
    const otherEmail = `tenant-inactive-ref-${suffix}@test.com`;
    await bootstrapOwner(otherTenant.id, otherEmail, 'password123').expect(201);
    const referenceRes = await login(
      otherEmail,
      'contrasena-incorrecta',
    ).expect(401);

    await prisma.tenant.update({
      where: { id: tenant.id },
      data: { active: false },
    });
    const inactiveTenantRes = await login(email, 'password123').expect(401);

    const referenceBody = referenceRes.body as ErrorResponseBody;
    const inactiveTenantBody = inactiveTenantRes.body as ErrorResponseBody;
    expect(inactiveTenantBody.message).toEqual(referenceBody.message);
  });

  it('AC-11: bloquea intentos de login tras 10 fallidos en 15 minutos para el mismo email (429)', async () => {
    const tenant = await createTenant('rate-limit');
    const email = `rate-limit-${suffix}@test.com`;
    await bootstrapOwner(tenant.id, email, 'password123').expect(201);

    for (let i = 0; i < 10; i++) {
      await login(email, 'password-incorrecta');
    }

    // El intento número 11, incluso con credenciales correctas, debe ser
    // rechazado con un código distinto al de credenciales inválidas (429).
    await login(email, 'password123').expect(429);
  });
});
