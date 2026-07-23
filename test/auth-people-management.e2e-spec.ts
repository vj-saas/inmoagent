import { randomBytes } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as argon2 from 'argon2';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Spec A.1 (specs/A1-auth-personas/spec.md) — gestión básica de personas por
 * un OWNER (alta, listado, baja, reseteo de contraseña) y logout.
 *
 * Rutas cubiertas por este archivo (contrato propuesto para el `planner`):
 *  - POST  /admin/tenants/:tenantId/people/bootstrap-owner          (X-Master-Key)
 *  - POST  /auth/login                                              (público)
 *  - POST  /auth/logout                                             (Authorization: Bearer <token>)
 *  - GET   /admin/tenants/:tenantId/people                          (Authorization: Bearer <token>, solo OWNER)
 *  - POST  /admin/tenants/:tenantId/people                          (Authorization: Bearer <token>, solo OWNER)
 *  - PATCH /admin/tenants/:tenantId/people/:personId/deactivate     (Authorization: Bearer <token>, solo OWNER)
 *  - POST  /admin/tenants/:tenantId/people/:personId/reset-password (Authorization: Bearer <token>, solo OWNER)
 *
 * El mecanismo de sesión concreto (JWT vs. cookie de servidor respaldada en
 * DB/Redis) queda a criterio del `planner` (ver spec.md, preguntas
 * abiertas). Estos tests solo asumen un token opaco devuelto por
 * `/auth/login` y enviado como `Authorization: Bearer <token>`, que es
 * comportamiento observable independiente de esa elección.
 *
 * Ninguna de estas rutas existe todavía: HOY se espera 404 en la mayoría de
 * los casos hasta que la fase de implementación las cree.
 */

interface PersonResponseBody {
  id: string;
  tenantId: string;
  email: string;
  role: 'OWNER' | 'AGENT';
  active: boolean;
  temporaryPassword?: string;
}

interface PeopleListResponseBody {
  people: PersonResponseBody[];
}

interface LoginResponseBody {
  token: string;
}

interface ErrorResponseBody {
  message: string;
}

describe('Auth: gestión de personas por un OWNER (e2e)', () => {
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
        name: `People Mgmt Tenant ${label}`,
        slug: `people-mgmt-${label.toLowerCase()}-${suffix}`,
        phoneNumberId: `people-mgmt-phone-${label.toLowerCase()}-${suffix}`,
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

  /**
   * Crea un tenant con un owner e intenta loguearlo. Hoy ninguna de las dos
   * rutas existe, así que el token queda en un placeholder; las llamadas
   * posteriores que lo usan van a fallar igual (401/404), lo cual es
   * correcto para este estado "rojo".
   */
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

  function listPeople(tenantId: string, token: string) {
    return request(app.getHttpServer())
      .get(`/admin/tenants/${tenantId}/people`)
      .set('Authorization', `Bearer ${token}`);
  }

  function deactivatePerson(tenantId: string, token: string, personId: string) {
    return request(app.getHttpServer())
      .patch(`/admin/tenants/${tenantId}/people/${personId}/deactivate`)
      .set('Authorization', `Bearer ${token}`);
  }

  function resetPassword(tenantId: string, token: string, personId: string) {
    return request(app.getHttpServer())
      .post(`/admin/tenants/${tenantId}/people/${personId}/reset-password`)
      .set('Authorization', `Bearer ${token}`);
  }

  function logout(token: string) {
    return request(app.getHttpServer())
      .post('/auth/logout')
      .set('Authorization', `Bearer ${token}`);
  }

  it('AC-7: crear/listar/desactivar sin sesión de persona válida responde 401 sin ejecutar la acción', async () => {
    const { tenant, ownerToken } = await setupTenantWithOwner('no-session');
    const leakedEmail = `sin-sesion-${suffix}@test.com`;

    await request(app.getHttpServer())
      .get(`/admin/tenants/${tenant.id}/people`)
      .expect(401);

    await request(app.getHttpServer())
      .post(`/admin/tenants/${tenant.id}/people`)
      .send({ email: leakedEmail, role: 'AGENT' })
      .expect(401);

    // La lista legítima (con sesión real del owner) no debería incluir a
    // nadie creado por el intento sin autenticar.
    const list = await listPeople(tenant.id, ownerToken).expect(200);
    const listBody = list.body as PeopleListResponseBody;
    const emails = listBody.people.map((p) => p.email);
    expect(emails).not.toContain(leakedEmail);
  });

  it('AC-17: un OWNER crea una nueva persona activa de su tenant y recibe una contraseña inicial una única vez', async () => {
    const { tenant, ownerToken } = await setupTenantWithOwner('create-ok');
    const newEmail = `agent-created-${suffix}@test.com`;

    const res = await createPerson(tenant.id, ownerToken, {
      email: newEmail,
      role: 'AGENT',
    }).expect(201);
    const body = res.body as PersonResponseBody;

    expect(body.tenantId).toBe(tenant.id);
    expect(body.email).toBe(newEmail.toLowerCase());
    expect(body.role).toBe('AGENT');
    expect(body.active).toBe(true);
    expect(body.temporaryPassword).toEqual(expect.any(String));
    expect((body.temporaryPassword ?? '').length).toBeGreaterThan(0);

    // La contraseña temporal no vuelve a aparecer en un listado posterior.
    const list = await listPeople(tenant.id, ownerToken).expect(200);
    expect(JSON.stringify(list.body)).not.toContain(body.temporaryPassword);
  });

  it('AC-18: rechaza crear una persona con un email ya usado (409), sin crear el registro', async () => {
    const { tenant, ownerToken, ownerEmail } =
      await setupTenantWithOwner('dup-email');

    await createPerson(tenant.id, ownerToken, {
      email: ownerEmail,
      role: 'AGENT',
    }).expect(409);

    // El owner original sigue pudiendo loguearse con su contraseña original
    // (la operación rechazada no debe haber tocado el registro existente).
    await login(ownerEmail, 'password123').expect(200);
  });

  it('AC-19: el listado de personas de un OWNER solo incluye a las de su propio tenant', async () => {
    const {
      tenant: tenantA,
      ownerToken: tokenA,
      ownerEmail: emailA,
    } = await setupTenantWithOwner('list-a');
    const { ownerEmail: emailB } = await setupTenantWithOwner('list-b');

    const list = await listPeople(tenantA.id, tokenA).expect(200);
    const people = (list.body as PeopleListResponseBody).people;

    expect(people.some((p) => p.email === emailA.toLowerCase())).toBe(true);
    expect(people.every((p) => p.tenantId === tenantA.id)).toBe(true);
    expect(people.some((p) => p.email === emailB.toLowerCase())).toBe(false);
  });

  it('AC-16: un AGENT no puede listar, crear ni desactivar personas (403)', async () => {
    const { tenant, ownerToken } =
      await setupTenantWithOwner('agent-forbidden');
    const agentEmail = `agent-forbidden-${suffix}@test.com`;
    const createRes = await createPerson(tenant.id, ownerToken, {
      email: agentEmail,
      role: 'AGENT',
      password: 'password123',
    }).expect(201);
    const agentId = (createRes.body as PersonResponseBody).id;

    const agentLogin = await login(agentEmail, 'password123').expect(200);
    const agentToken = (agentLogin.body as LoginResponseBody).token;

    await listPeople(tenant.id, agentToken).expect(403);
    await createPerson(tenant.id, agentToken, {
      email: `otro-${suffix}@test.com`,
      role: 'AGENT',
    }).expect(403);
    await deactivatePerson(tenant.id, agentToken, agentId).expect(403);
  });

  it('AC-9 (caso cuenta inactiva): tras desactivar, el login de esa cuenta responde 401 con el mismo mensaje genérico', async () => {
    const { tenant, ownerToken } = await setupTenantWithOwner('inactive-login');
    const agentEmail = `to-deactivate-login-${suffix}@test.com`;
    const createRes = await createPerson(tenant.id, ownerToken, {
      email: agentEmail,
      role: 'AGENT',
      password: 'password123',
    }).expect(201);
    const agentId = (createRes.body as PersonResponseBody).id;

    await deactivatePerson(tenant.id, ownerToken, agentId).expect(200);

    const wrongCredsRes = await login(
      `no-existe-${suffix}@test.com`,
      'cualquier-cosa',
    ).expect(401);
    const inactiveRes = await login(agentEmail, 'password123').expect(401);

    const wrongCredsBody = wrongCredsRes.body as ErrorResponseBody;
    const inactiveBody = inactiveRes.body as ErrorResponseBody;
    expect(inactiveBody.message).toEqual(wrongCredsBody.message);
  });

  it('AC-20: desactivar una persona invalida logins nuevos y cualquier sesión previa de esa cuenta', async () => {
    const { tenant, ownerToken } =
      await setupTenantWithOwner('deactivate-session');
    const agentEmail = `deactivate-session-${suffix}@test.com`;
    const createRes = await createPerson(tenant.id, ownerToken, {
      email: agentEmail,
      role: 'AGENT',
      password: 'password123',
    }).expect(201);
    const agentId = (createRes.body as PersonResponseBody).id;

    const agentLogin = await login(agentEmail, 'password123').expect(200);
    const agentToken = (agentLogin.body as LoginResponseBody).token;

    await deactivatePerson(tenant.id, ownerToken, agentId).expect(200);

    await login(agentEmail, 'password123').expect(401);
    // La sesión previamente emitida para esa persona ya no debería ser
    // válida (usamos logout como acción cualquiera protegida por el guard).
    await logout(agentToken).expect(401);
  });

  it('AC-21: rechaza desactivar al último owner activo del tenant (409), sin cambiar su estado', async () => {
    const { tenant, ownerToken, ownerEmail } =
      await setupTenantWithOwner('last-owner');

    const list = await listPeople(tenant.id, ownerToken).expect(200);
    const owner = (list.body as PeopleListResponseBody).people.find(
      (p) => p.email === ownerEmail.toLowerCase(),
    );
    const ownerId = owner?.id ?? 'unknown-owner-id';

    await deactivatePerson(tenant.id, ownerToken, ownerId).expect(409);

    // El owner sigue pudiendo loguearse: su estado no cambió.
    await login(ownerEmail, 'password123').expect(200);
  });

  it('AC-22: logout invalida la sesión (una request posterior con el mismo token responde 401)', async () => {
    const { tenant, ownerToken } = await setupTenantWithOwner('logout');

    await logout(ownerToken).expect(200);
    await listPeople(tenant.id, ownerToken).expect(401);
  });

  it('AC-23: un OWNER regenera la contraseña de otra persona, invalida sus sesiones y devuelve una temporal una única vez', async () => {
    const { tenant, ownerToken } = await setupTenantWithOwner('reset-pw');
    const agentEmail = `reset-pw-${suffix}@test.com`;
    const createRes = await createPerson(tenant.id, ownerToken, {
      email: agentEmail,
      role: 'AGENT',
      password: 'password123',
    }).expect(201);
    const agentId = (createRes.body as PersonResponseBody).id;

    const agentLogin = await login(agentEmail, 'password123').expect(200);
    const oldAgentToken = (agentLogin.body as LoginResponseBody).token;

    const resetRes = await resetPassword(tenant.id, ownerToken, agentId).expect(
      200,
    );
    const newPassword = (resetRes.body as PersonResponseBody)
      .temporaryPassword as string;
    expect(newPassword).toEqual(expect.any(String));
    expect(newPassword.length).toBeGreaterThan(0);

    // La sesión previa de esa persona queda invalidada.
    await logout(oldAgentToken).expect(401);

    // La contraseña vieja ya no sirve; la nueva sí.
    await login(agentEmail, 'password123').expect(401);
    await login(agentEmail, newPassword).expect(200);
  });
});
