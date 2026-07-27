import { randomBytes } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PersonRole } from '@prisma/client';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Tests de aceptación de spec B.4 (specs/B4-push-notificaciones/spec.md):
 * endpoint de alta/baja de `PushSubscription`.
 *
 * Contrato asumido por este archivo (a definir por `planner`/`implementer`,
 * documentado acá para que ambos construyan contra esta superficie exacta,
 * dado que este punto requería aprobación humana explícita antes de avanzar
 * según la spec):
 *
 *  - `POST   /admin/tenants/:tenantId/push-subscriptions` — body
 *    `{ endpoint, p256dh, auth }`. Guard de clase `PersonOrApiKeyGuard` +
 *    guard de método `PersonSessionRequiredGuard` (mismo patrón que
 *    `POST admin/tenants/:tenantId/leads/:leadId/send`). Crea la
 *    `PushSubscription` asociada a `req.person.id` y a `req.person.tenantId`
 *    (nunca a un `tenantId` del body, aunque se envíe).
 *  - `DELETE /admin/tenants/:tenantId/push-subscriptions` — body
 *    `{ endpoint }`. Mismos guards. Borra únicamente si la suscripción con ese
 *    `endpoint` pertenece a `req.person.id` Y `req.person.tenantId`; si no
 *    (pertenece a otra persona del mismo tenant, o a otro tenant), responde
 *    404 sin borrar nada (no revela si el endpoint existe en otra cuenta).
 *  - Toda lectura/alta/baja está filtrada por `tenantId` de la persona
 *    autenticada (AC-12): nunca cross-tenant.
 *
 * Cubre AC-1, AC-3, AC-4, AC-5, AC-12. (AC-2, AC-6 a AC-11, AC-13, AC-14 se
 * cubren en otros archivos de este mismo lote.)
 */
describe('Admin: push-subscriptions B.4 (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const masterKey = process.env.ADMIN_MASTER_KEY ?? 'dev-admin-master-key';
  const suffix = randomBytes(4).toString('hex');
  const KNOWN_PASSWORD = 'password123';

  let tenantA: string;
  let apiKeyA: string;
  let ownerTokenA: string;
  let agentTokenA: string;

  let tenantB: string;
  let ownerTokenB: string;

  const tenantIds: string[] = [];

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);

    const setupA = await setupTenant('a');
    tenantA = setupA.tenantId;
    apiKeyA = setupA.apiKey;
    const setupB = await setupTenant('b');
    tenantB = setupB.tenantId;

    ownerTokenA = await bootstrapOwnerAndLogin(tenantA, `push-owner-a-${suffix}`);
    agentTokenA = await createAgentAndLogin(
      tenantA,
      ownerTokenA,
      `push-agent-a-${suffix}`,
    );
    ownerTokenB = await bootstrapOwnerAndLogin(tenantB, `push-owner-b-${suffix}`);
  });

  afterAll(async () => {
    await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    await app.close();
  });

  async function setupTenant(
    label: string,
  ): Promise<{ tenantId: string; apiKey: string }> {
    const res = await request(app.getHttpServer())
      .post('/admin/tenants')
      .set('X-Master-Key', masterKey)
      .send({
        name: `Push Tenant ${label}`,
        slug: `push-b4-${label}-${suffix}`,
        phoneNumberId: `push-b4-phone-${label}-${suffix}`,
        accessToken: 'meta-token-plano',
      })
      .expect(201);
    const body = res.body as { tenantId: string; apiKey: string };
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
    return (res.body as { token: string }).token;
  }

  const url = (tenantId: string) => `/admin/tenants/${tenantId}/push-subscriptions`;
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

  function subscriptionPayload(label: string) {
    return {
      endpoint: `https://fcm.googleapis.com/fcm/send/${label}-${randomBytes(6).toString('hex')}`,
      p256dh: `p256dh-${randomBytes(8).toString('base64url')}`,
      auth: `auth-${randomBytes(8).toString('base64url')}`,
    };
  }

  // ── AC-1: alta con sesión válida asocia personId + tenantId reales ─────

  describe('AC-1: alta de PushSubscription', () => {
    it('crea la suscripción asociada a la persona y al tenant de la sesión, ignorando un tenantId del body', async () => {
      const payload = subscriptionPayload('ac1');
      const res = await request(app.getHttpServer())
        .post(url(tenantA))
        .set(bearer(ownerTokenA))
        .send({ ...payload, tenantId: tenantB, personId: 'otra-persona' })
        .expect(201);

      const body = res.body as { id: string };
      expect(body.id).toBeDefined();

      const stored = await prisma.pushSubscription.findUnique({
        where: { id: body.id },
      });
      expect(stored).not.toBeNull();
      expect(stored!.tenantId).toBe(tenantA);
      expect(stored!.tenantId).not.toBe(tenantB);
      expect(stored!.endpoint).toBe(payload.endpoint);
    });
  });

  // ── AC-5: sin sesión de persona (API key) → 403 ─────────────────────────

  describe('AC-5: sin sesión de persona → 403', () => {
    it('alta con API key de tenant (sin sesión) → 403', async () => {
      const payload = subscriptionPayload('ac5-post');
      await request(app.getHttpServer())
        .post(url(tenantA))
        .set('X-Api-Key', apiKeyA)
        .send(payload)
        .expect(403);
    });

    it('baja con API key de tenant (sin sesión) → 403', async () => {
      await request(app.getHttpServer())
        .delete(url(tenantA))
        .set('X-Api-Key', apiKeyA)
        .send({ endpoint: 'https://fcm.googleapis.com/fcm/send/no-importa' })
        .expect(403);
    });

    it('alta sin ningún header de autenticación → 401 (no llega a exigir sesión de persona)', async () => {
      const payload = subscriptionPayload('ac5-none');
      await request(app.getHttpServer()).post(url(tenantA)).send(payload).expect(401);
    });
  });

  // ── AC-3: baja de una suscripción propia ────────────────────────────────

  describe('AC-3: baja de PushSubscription propia', () => {
    it('borra la suscripción propia por endpoint', async () => {
      const payload = subscriptionPayload('ac3');
      const created = await request(app.getHttpServer())
        .post(url(tenantA))
        .set(bearer(ownerTokenA))
        .send(payload)
        .expect(201);
      const id = (created.body as { id: string }).id;

      await request(app.getHttpServer())
        .delete(url(tenantA))
        .set(bearer(ownerTokenA))
        .send({ endpoint: payload.endpoint })
        .expect(200);

      const gone = await prisma.pushSubscription.findUnique({ where: { id } });
      expect(gone).toBeNull();
    });
  });

  // ── AC-4 y AC-12: aislamiento multi-tenant, el punto crítico ────────────

  describe('AC-4 y AC-12: aislamiento multi-tenant en baja', () => {
    it('AC-4: la sesión del tenant A no puede borrar una suscripción de una Person de otro tenant (B)', async () => {
      const payloadB = subscriptionPayload('ac4-crosstenant');
      const createdB = await request(app.getHttpServer())
        .post(url(tenantB))
        .set(bearer(ownerTokenB))
        .send(payloadB)
        .expect(201);
      const idB = (createdB.body as { id: string }).id;

      await request(app.getHttpServer())
        .delete(url(tenantA))
        .set(bearer(ownerTokenA))
        .send({ endpoint: payloadB.endpoint })
        .expect(404);

      const stillThere = await prisma.pushSubscription.findUnique({
        where: { id: idB },
      });
      expect(stillThere).not.toBeNull();
    });

    it('AC-4: una sesión del tenant A no puede borrar la suscripción de OTRA persona del MISMO tenant (el agente)', async () => {
      const payloadAgent = subscriptionPayload('ac4-samepersonother');
      const createdAgent = await request(app.getHttpServer())
        .post(url(tenantA))
        .set(bearer(agentTokenA))
        .send(payloadAgent)
        .expect(201);
      const idAgent = (createdAgent.body as { id: string }).id;

      await request(app.getHttpServer())
        .delete(url(tenantA))
        .set(bearer(ownerTokenA))
        .send({ endpoint: payloadAgent.endpoint })
        .expect(404);

      const stillThere = await prisma.pushSubscription.findUnique({
        where: { id: idAgent },
      });
      expect(stillThere).not.toBeNull();
    });

    it('AC-12: la sesión de tenant A contra la URL de tenant B (:tenantId de B) → 403, sin exponer ni tocar datos de B', async () => {
      const payloadB = subscriptionPayload('ac12-urlcross');
      const createdB = await request(app.getHttpServer())
        .post(url(tenantB))
        .set(bearer(ownerTokenB))
        .send(payloadB)
        .expect(201);
      const idB = (createdB.body as { id: string }).id;

      const res = await request(app.getHttpServer())
        .delete(url(tenantB))
        .set(bearer(ownerTokenA))
        .send({ endpoint: payloadB.endpoint })
        .expect(403);
      expect(JSON.stringify(res.body)).not.toContain(payloadB.endpoint);

      const stillThere = await prisma.pushSubscription.findUnique({
        where: { id: idB },
      });
      expect(stillThere).not.toBeNull();
    });

    it('AC-12: POST de alta con sesión de A contra la URL de B → 403, no crea nada en B a nombre de A', async () => {
      const before = await prisma.pushSubscription.count({
        where: { tenantId: tenantB },
      });
      await request(app.getHttpServer())
        .post(url(tenantB))
        .set(bearer(ownerTokenA))
        .send(subscriptionPayload('ac12-post-cross'))
        .expect(403);
      const after = await prisma.pushSubscription.count({
        where: { tenantId: tenantB },
      });
      expect(after).toBe(before);
    });
  });
});
