import { randomBytes } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AppointmentStatus, PersonRole } from '@prisma/client';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Spec A.2 (specs/A2-frontend-base/spec.md) — T6: prueba definitiva del guard
 * compuesto `PersonOrApiKeyGuard` aplicado a los TRES recursos admin scopeados
 * a un tenant (`leads`, `metrics`, `properties`). Consolida en un solo lugar la
 * evidencia de que:
 *
 *  - AC-17: una sesión de persona (OWNER o AGENT) SIN API key autoriza la
 *    request y devuelve únicamente datos del tenant de esa persona.
 *  - AC-18: una API key de tenant válida SIN sesión sigue funcionando igual que
 *    antes (camino server-to-server intacto).
 *  - AC-19: una sesión del tenant A contra la URL con `:tenantId` del tenant B
 *    es rechazada (403), sin devolver datos de B.
 *  - Ninguno de los dos headers → 401.
 *  - Ambos headers (X-Api-Key inválido + Bearer válido) → gana la precedencia de
 *    API key: 401 de API key, NO cae a la rama de sesión.
 *
 * Los endpoints de negocio no leen `request.tenant`: filtran por el `:tenantId`
 * del path. El guard es la única barrera de aislamiento, por eso esta cobertura
 * es crítica.
 */

interface LoginResponseBody {
  token: string;
}

interface PersonResponseBody {
  id: string;
  temporaryPassword?: string;
}

interface CreateTenantResponseBody {
  tenantId: string;
  apiKey: string;
}

interface LeadsListResponseBody {
  leads: Array<{ id: string; tenantId: string; phone: string }>;
}

interface PropertiesListResponseBody {
  properties: Array<{ id: string; title?: string }>;
}

describe('Admin: guard compuesto PersonOrApiKey en leads/metrics/properties (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const masterKey = process.env.ADMIN_MASTER_KEY ?? 'dev-admin-master-key';
  const suffix = randomBytes(4).toString('hex');
  const KNOWN_PASSWORD = 'password123';
  const metricsRange = {
    from: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    to: new Date().toISOString(),
  };

  const tenantIds: string[] = [];

  // Contexto de tenant A (la persona autenticada vive acá).
  let tenantA: string;
  let apiKeyA: string;
  let ownerTokenA: string;
  let agentTokenA: string;
  let leadAPhone: string;
  let propAId: string;

  // Contexto de tenant B (el objetivo del intento cross-tenant).
  let tenantB: string;
  let apiKeyB: string;
  let leadBPhone: string;
  let leadBId: string;
  let propBId: string;

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
    apiKeyB = setupB.apiKey;

    // Owner + agent con sesión válida en tenant A.
    ownerTokenA = await bootstrapOwnerAndLogin(tenantA, `owner-a-${suffix}`);
    agentTokenA = await createAgentAndLogin(
      tenantA,
      ownerTokenA,
      `agent-a-${suffix}`,
    );

    // Datos de negocio distinguibles en cada tenant.
    leadAPhone = `54911${randomBytes(4).toString('hex')}`;
    leadBPhone = `54911${randomBytes(4).toString('hex')}`;
    await prisma.lead.create({ data: { tenantId: tenantA, phone: leadAPhone } });
    const leadB = await prisma.lead.create({
      data: { tenantId: tenantB, phone: leadBPhone },
    });
    leadBId = leadB.id;

    propAId = await createProperty(tenantA, apiKeyA, `Propiedad A ${suffix}`);
    propBId = await createProperty(tenantB, apiKeyB, `Propiedad B ${suffix}`);
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
        name: `Composite Tenant ${label}`,
        slug: `guard-composite-${label}-${suffix}`,
        phoneNumberId: `guard-composite-phone-${label}-${suffix}`,
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

  async function createProperty(
    tenantId: string,
    apiKey: string,
    title: string,
  ): Promise<string> {
    const res = await request(app.getHttpServer())
      .post(`/admin/tenants/${tenantId}/properties`)
      .set('X-Api-Key', apiKey)
      .send({
        title,
        operation: 'RENT',
        propertyType: 'departamento',
        price: 150000,
        neighborhood: 'caballito',
      })
      .expect(201);
    return (res.body as PersonResponseBody).id;
  }

  // Helpers de request por recurso, sin credenciales (cada test las agrega).
  const leadsUrl = (tenantId: string) => `/admin/tenants/${tenantId}/leads`;
  const metricsUrl = (tenantId: string) => `/admin/tenants/${tenantId}/metrics`;
  const propertiesUrl = (tenantId: string) =>
    `/admin/tenants/${tenantId}/properties`;

  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

  describe('AC-17: sesión de persona SIN API key autoriza y devuelve solo datos de su tenant', () => {
    // Ambos roles (OWNER y AGENT) leen: estos endpoints no imponen restricción
    // de rol adicional (a diferencia de /people, que exige OWNER). El guard
    // compuesto solo verifica sesión válida + scope de tenant.
    const roles = () => [
      { name: 'OWNER', token: ownerTokenA },
      { name: 'AGENT', token: agentTokenA },
    ];

    it.each([
      ['OWNER'],
      ['AGENT'],
    ])('leads: %s con sesión lee solo leads de su tenant', async (roleName) => {
      const token = roles().find((r) => r.name === roleName)!.token;
      const res = await request(app.getHttpServer())
        .get(leadsUrl(tenantA))
        .set(bearer(token))
        .expect(200);
      const body = res.body as LeadsListResponseBody;
      expect(body.leads.every((l) => l.tenantId === tenantA)).toBe(true);
      expect(body.leads.some((l) => l.phone === leadAPhone)).toBe(true);
      expect(body.leads.some((l) => l.phone === leadBPhone)).toBe(false);
    });

    it.each([['OWNER'], ['AGENT']])(
      'metrics: %s con sesión obtiene las métricas de su tenant',
      async (roleName) => {
        const token = roles().find((r) => r.name === roleName)!.token;
        const res = await request(app.getHttpServer())
          .get(metricsUrl(tenantA))
          .query(metricsRange)
          .set(bearer(token))
          .expect(200);
        expect(res.body).toEqual(
          expect.objectContaining({
            newLeads: expect.any(Number),
            activeConversations: expect.any(Number),
            handoffs: expect.any(Number),
          }),
        );
      },
    );

    it.each([['OWNER'], ['AGENT']])(
      'properties: %s con sesión lee solo propiedades de su tenant',
      async (roleName) => {
        const token = roles().find((r) => r.name === roleName)!.token;
        const res = await request(app.getHttpServer())
          .get(propertiesUrl(tenantA))
          .set(bearer(token))
          .expect(200);
        const body = res.body as PropertiesListResponseBody;
        expect(body.properties.some((p) => p.id === propAId)).toBe(true);
        expect(body.properties.some((p) => p.id === propBId)).toBe(false);
      },
    );
  });

  describe('AC-18: API key de tenant SIN sesión sigue funcionando (camino legado intacto)', () => {
    it('leads: la API key del tenant lista sus leads', async () => {
      const res = await request(app.getHttpServer())
        .get(leadsUrl(tenantA))
        .set('X-Api-Key', apiKeyA)
        .expect(200);
      const body = res.body as LeadsListResponseBody;
      expect(body.leads.some((l) => l.phone === leadAPhone)).toBe(true);
    });

    it('metrics: la API key del tenant obtiene sus métricas', async () => {
      await request(app.getHttpServer())
        .get(metricsUrl(tenantA))
        .query(metricsRange)
        .set('X-Api-Key', apiKeyA)
        .expect(200);
    });

    it('properties: la API key del tenant lista sus propiedades', async () => {
      const res = await request(app.getHttpServer())
        .get(propertiesUrl(tenantA))
        .set('X-Api-Key', apiKeyA)
        .expect(200);
      const body = res.body as PropertiesListResponseBody;
      expect(body.properties.some((p) => p.id === propAId)).toBe(true);
    });

    it('la API key de A no autoriza sobre la URL de B (aislamiento por API key intacto)', async () => {
      await request(app.getHttpServer())
        .get(leadsUrl(tenantB))
        .set('X-Api-Key', apiKeyA)
        .expect(401);
    });
  });

  describe('AC-19: sesión de tenant A contra URL de tenant B → 403, sin datos de B', () => {
    it('leads: rechaza y no filtra datos de B', async () => {
      const res = await request(app.getHttpServer())
        .get(leadsUrl(tenantB))
        .set(bearer(ownerTokenA))
        .expect(403);
      expect(JSON.stringify(res.body)).not.toContain(leadBPhone);
    });

    it('leads: también con rol AGENT del tenant A', async () => {
      await request(app.getHttpServer())
        .get(leadsUrl(tenantB))
        .set(bearer(agentTokenA))
        .expect(403);
    });

    it('metrics: rechaza el cross-tenant', async () => {
      await request(app.getHttpServer())
        .get(metricsUrl(tenantB))
        .query(metricsRange)
        .set(bearer(ownerTokenA))
        .expect(403);
    });

    it('properties: rechaza y no filtra datos de B', async () => {
      const res = await request(app.getHttpServer())
        .get(propertiesUrl(tenantB))
        .set(bearer(ownerTokenA))
        .expect(403);
      expect(JSON.stringify(res.body)).not.toContain(propBId);
    });

    it('leads: detalle (GET /leads/:leadId) también rechaza contra la URL de B, sin devolver el lead', async () => {
      const res = await request(app.getHttpServer())
        .get(`${leadsUrl(tenantB)}/${leadBId}`)
        .set(bearer(ownerTokenA))
        .expect(403);
      expect(JSON.stringify(res.body)).not.toContain(leadBPhone);
    });
  });

  describe('Sin credenciales → 401 en los tres recursos', () => {
    it('leads sin headers → 401', async () => {
      await request(app.getHttpServer()).get(leadsUrl(tenantA)).expect(401);
    });
    it('metrics sin headers → 401', async () => {
      await request(app.getHttpServer())
        .get(metricsUrl(tenantA))
        .query(metricsRange)
        .expect(401);
    });
    it('properties sin headers → 401', async () => {
      await request(app.getHttpServer()).get(propertiesUrl(tenantA)).expect(401);
    });
  });

  describe('Precedencia: X-Api-Key inválido + Bearer válido → gana API key (401, no cae a sesión)', () => {
    // Si el guard cayera a la rama de sesión ante una API key inválida, esto
    // devolvería 200. Debe devolver 401: la presencia del header X-Api-Key
    // fija el camino legado de forma determinista.
    it('leads', async () => {
      await request(app.getHttpServer())
        .get(leadsUrl(tenantA))
        .set('X-Api-Key', 'api-key-invalida')
        .set(bearer(ownerTokenA))
        .expect(401);
    });
    it('metrics', async () => {
      await request(app.getHttpServer())
        .get(metricsUrl(tenantA))
        .query(metricsRange)
        .set('X-Api-Key', 'api-key-invalida')
        .set(bearer(ownerTokenA))
        .expect(401);
    });
    it('properties', async () => {
      await request(app.getHttpServer())
        .get(propertiesUrl(tenantA))
        .set('X-Api-Key', 'api-key-invalida')
        .set(bearer(ownerTokenA))
        .expect(401);
    });
  });

  /**
   * Gap detectado en T6: los endpoints de ESCRITURA protegidos por el mismo
   * guard compuesto solo estaban probados cross-tenant por API KEY (e2e legados),
   * no por SESIÓN. El guard corre antes del handler, así que un intento
   * cross-tenant por sesión debe dar 403 (TenantScopeGuard) SIN ejecutar la
   * operación. Verificamos ambas caras: el 403 no muta datos de B, y la misma
   * operación con la sesión del tenant correcto sí funciona.
   */
  describe('Escritura cross-tenant por sesión: A contra URL de B → 403, sin efecto sobre B', () => {
    it('POST leads/:id/release: sesión A contra B → 403 y el lead de B no cambia de estado', async () => {
      await request(app.getHttpServer())
        .post(`${leadsUrl(tenantB)}/${leadBId}/release`)
        .set(bearer(ownerTokenA))
        .expect(403);
      const leadB = await prisma.lead.findUnique({ where: { id: leadBId } });
      expect(leadB).not.toBeNull();
      expect(leadB!.tenantId).toBe(tenantB);
    });

    it('DELETE leads/:id: sesión A contra B → 403 y el lead de B sigue existiendo', async () => {
      await request(app.getHttpServer())
        .delete(`${leadsUrl(tenantB)}/${leadBId}`)
        .set(bearer(ownerTokenA))
        .expect(403);
      const leadB = await prisma.lead.findUnique({ where: { id: leadBId } });
      expect(leadB).not.toBeNull();
    });

    it('DELETE leads/:id: también con rol AGENT del tenant A → 403', async () => {
      await request(app.getHttpServer())
        .delete(`${leadsUrl(tenantB)}/${leadBId}`)
        .set(bearer(agentTokenA))
        .expect(403);
      const leadB = await prisma.lead.findUnique({ where: { id: leadBId } });
      expect(leadB).not.toBeNull();
    });

    it('POST properties: sesión A contra B → 403 y no se crea propiedad en B', async () => {
      const before = await prisma.property.count({ where: { tenantId: tenantB } });
      await request(app.getHttpServer())
        .post(propertiesUrl(tenantB))
        .set(bearer(ownerTokenA))
        .send({
          title: `Intrusa ${suffix}`,
          operation: 'RENT',
          propertyType: 'departamento',
          price: 999999,
          neighborhood: 'palermo',
        })
        .expect(403);
      const after = await prisma.property.count({ where: { tenantId: tenantB } });
      expect(after).toBe(before);
    });

    it('PATCH properties/:id: sesión A contra B → 403 y la propiedad de B no muta', async () => {
      const before = await prisma.property.findUnique({ where: { id: propBId } });
      await request(app.getHttpServer())
        .patch(`${propertiesUrl(tenantB)}/${propBId}`)
        .set(bearer(ownerTokenA))
        .send({ title: `Hackeada ${suffix}`, price: 1 })
        .expect(403);
      const after = await prisma.property.findUnique({ where: { id: propBId } });
      expect(after).not.toBeNull();
      expect(after!.title).toBe(before!.title);
      expect(after!.price.toString()).toBe(before!.price.toString());
    });

    it('PATCH properties/:id/status: sesión A contra B → 403 y el estado de B no cambia', async () => {
      const before = await prisma.property.findUnique({ where: { id: propBId } });
      await request(app.getHttpServer())
        .patch(`${propertiesUrl(tenantB)}/${propBId}/status`)
        .set(bearer(ownerTokenA))
        .send({ status: 'PAUSED' })
        .expect(403);
      const after = await prisma.property.findUnique({ where: { id: propBId } });
      expect(after!.status).toBe(before!.status);
    });

    it('DELETE properties/:id: sesión A contra B → 403 y la propiedad de B sigue existiendo', async () => {
      await request(app.getHttpServer())
        .delete(`${propertiesUrl(tenantB)}/${propBId}`)
        .set(bearer(ownerTokenA))
        .expect(403);
      const after = await prisma.property.findUnique({ where: { id: propBId } });
      expect(after).not.toBeNull();
    });
  });

  /**
   * A.4 T8 — caso (c): los SEIS endpoints nuevos de la ficha del lead
   * (`notes` POST/GET, `contacted`, `uncontacted`, `opt-out`, `assignment`)
   * cuelgan del mismo controller protegido por el guard compuesto. Una sesión
   * del tenant A contra el `:tenantId` de B debe dar 403 (TenantScopeGuard,
   * antes del handler) SIN exponer ni modificar el lead de B. Complementa la
   * cobertura de escritura de arriba (release/delete/properties), que no
   * incluía los endpoints de A.4.
   */
  describe('A.4: endpoints de ficha del lead cross-tenant por sesión: A contra URL de B → 403, sin efecto sobre B', () => {
    const leadBPath = (path: string) =>
      `${leadsUrl(tenantB)}/${leadBId}/${path}`;

    it('POST notes: A contra B → 403 y no se crea nota en el lead de B', async () => {
      const before = await prisma.leadNote.count({ where: { leadId: leadBId } });
      const res = await request(app.getHttpServer())
        .post(leadBPath('notes'))
        .set(bearer(ownerTokenA))
        .send({ body: `intrusa ${suffix}` })
        .expect(403);
      expect(JSON.stringify(res.body)).not.toContain(leadBPhone);
      const after = await prisma.leadNote.count({ where: { leadId: leadBId } });
      expect(after).toBe(before);
    });

    it('GET notes: A contra B → 403 sin exponer notas de B', async () => {
      const res = await request(app.getHttpServer())
        .get(leadBPath('notes'))
        .set(bearer(ownerTokenA))
        .expect(403);
      expect(JSON.stringify(res.body)).not.toContain(leadBPhone);
    });

    it('POST contacted: A contra B → 403 y el lead de B no queda contactado', async () => {
      await request(app.getHttpServer())
        .post(leadBPath('contacted'))
        .set(bearer(ownerTokenA))
        .expect(403);
      const leadB = await prisma.lead.findUniqueOrThrow({
        where: { id: leadBId },
      });
      expect(leadB.contactedAt).toBeNull();
    });

    it('POST uncontacted: A contra B → 403', async () => {
      await request(app.getHttpServer())
        .post(leadBPath('uncontacted'))
        .set(bearer(ownerTokenA))
        .expect(403);
    });

    it('POST opt-out: A contra B → 403 y el estado de B no cambia', async () => {
      const before = await prisma.lead.findUniqueOrThrow({
        where: { id: leadBId },
      });
      await request(app.getHttpServer())
        .post(leadBPath('opt-out'))
        .set(bearer(ownerTokenA))
        .expect(403);
      const after = await prisma.lead.findUniqueOrThrow({
        where: { id: leadBId },
      });
      expect(after.state).toBe(before.state);
      expect(after.optedOutAt).toEqual(before.optedOutAt);
    });

    it('PATCH assignment: A contra B → 403 y el lead de B no queda asignado', async () => {
      await request(app.getHttpServer())
        .patch(leadBPath('assignment'))
        .set(bearer(ownerTokenA))
        .send({ assignedUserId: 'cualquier-id', nextActionAt: null })
        .expect(403);
      const leadB = await prisma.lead.findUniqueOrThrow({
        where: { id: leadBId },
      });
      expect(leadB.assignedUserId).toBeNull();
    });

    it('también con rol AGENT del tenant A: POST opt-out contra B → 403', async () => {
      await request(app.getHttpServer())
        .post(leadBPath('opt-out'))
        .set(bearer(agentTokenA))
        .expect(403);
    });
  });

  describe('Escritura con la sesión del tenant correcto sí funciona (contracara del 403)', () => {
    it('POST properties + PATCH + DELETE: ciclo completo con sesión de A → 2xx', async () => {
      const created = await request(app.getHttpServer())
        .post(propertiesUrl(tenantA))
        .set(bearer(ownerTokenA))
        .send({
          title: `Escritura OK ${suffix}`,
          operation: 'SALE',
          propertyType: 'casa',
          price: 250000,
          neighborhood: 'flores',
        })
        .expect(201);
      const id = (created.body as PersonResponseBody).id;

      await request(app.getHttpServer())
        .patch(`${propertiesUrl(tenantA)}/${id}`)
        .set(bearer(ownerTokenA))
        .send({ title: `Escritura editada ${suffix}` })
        .expect(200);
      const edited = await prisma.property.findUnique({ where: { id } });
      expect(edited!.title).toBe(`Escritura editada ${suffix}`);

      await request(app.getHttpServer())
        .delete(`${propertiesUrl(tenantA)}/${id}`)
        .set(bearer(ownerTokenA))
        .expect(200);
      const removed = await prisma.property.findUnique({ where: { id } });
      expect(removed).toBeNull();
    });

    it('POST leads/:id/release: con sesión de A libera un lead de A en HUMAN_HANDOFF → 200', async () => {
      const handoffLead = await prisma.lead.create({
        data: {
          tenantId: tenantA,
          phone: `54911${randomBytes(4).toString('hex')}`,
          state: 'HUMAN_HANDOFF',
          handoffAt: new Date(),
        },
      });

      await request(app.getHttpServer())
        .post(`${leadsUrl(tenantA)}/${handoffLead.id}/release`)
        .set(bearer(ownerTokenA))
        .expect(200);
      const released = await prisma.lead.findUnique({
        where: { id: handoffLead.id },
      });
      expect(released!.state).toBe('QUALIFICATION');
      expect(released!.handoffAt).toBeNull();
    });

    it('DELETE leads/:id: con sesión de A borra un lead de A → 200', async () => {
      const disposable = await prisma.lead.create({
        data: {
          tenantId: tenantA,
          phone: `54911${randomBytes(4).toString('hex')}`,
        },
      });

      await request(app.getHttpServer())
        .delete(`${leadsUrl(tenantA)}/${disposable.id}`)
        .set(bearer(ownerTokenA))
        .expect(200);
      const gone = await prisma.lead.findUnique({ where: { id: disposable.id } });
      expect(gone).toBeNull();
    });
  });

  /**
   * B.1 T10 — regresión de aislamiento multi-tenant sobre los SEIS endpoints de
   * appointments (`GET` + `confirm`/`reschedule`/`cancel`/`done`/`no-show`),
   * consolidada acá junto al resto de la cobertura del guard compuesto (mismo
   * criterio que A.3/A.4). Cubre:
   *
   *  (a) sesión de tenant A contra `:tenantId` de tenant B → 403 (TenantScopeGuard,
   *      antes del handler) SIN exponer ni modificar la cita de B (ambos roles
   *      OWNER y AGENT donde el patrón lo hace).
   *  (b) el camino de API key (`X-Api-Key`) sigue funcionando igual que antes en
   *      los seis endpoints (caso explícito de no-regresión).
   *  (c) `confirm` con `assignedUserId` de OTRO tenant (session-based) → 400, no
   *      404: la validación de persona no cruza tenant (refuerza AC-5, que en
   *      `admin-appointments.e2e-spec.ts::AC-5b` ya lo cubre por X-Api-Key).
   *
   * El estado de `apptB` es irrelevante para el 403: el guard corta antes del
   * handler, así que un único `apptB` en CONFIRMED sirve para las cinco
   * transiciones y verificamos que status/scheduledAt no cambian.
   */
  describe('B.1: appointments cross-tenant (guard compuesto) sobre los 6 endpoints', () => {
    let leadAApptId: string;
    let apptB: { id: string; scheduledAt: Date; status: AppointmentStatus };
    let personBId: string;
    const apptScheduledB = new Date('2026-11-10T12:00:00.000Z');
    const futureDate = '2026-12-01T15:00:00.000Z';

    const apptsUrl = (tenantId: string) =>
      `/admin/tenants/${tenantId}/appointments`;
    // Los 5 endpoints POST de transición con un body válido mínimo (que igual no
    // se ejecuta cuando el guard rechaza cross-tenant).
    const transitionActions: Array<{ path: string; body: object }> = [
      { path: 'confirm', body: { scheduledAt: futureDate } },
      { path: 'reschedule', body: { scheduledAt: futureDate } },
      { path: 'cancel', body: {} },
      { path: 'done', body: {} },
      { path: 'no-show', body: {} },
    ];

    beforeAll(async () => {
      // Lead + persona en B, y una cita persistente de B como objetivo ajeno.
      const leadA = await prisma.lead.create({
        data: {
          tenantId: tenantA,
          phone: `54911${randomBytes(4).toString('hex')}`,
        },
      });
      leadAApptId = leadA.id;

      const leadB = await prisma.lead.create({
        data: {
          tenantId: tenantB,
          phone: `54911${randomBytes(4).toString('hex')}`,
        },
      });
      const personB = await prisma.person.create({
        data: {
          tenantId: tenantB,
          email: `person-b-appt-${suffix}@test.com`,
          passwordHash: 'irrelevante',
          role: PersonRole.AGENT,
        },
      });
      personBId = personB.id;

      const createdB = await prisma.appointment.create({
        data: {
          tenantId: tenantB,
          leadId: leadB.id,
          status: AppointmentStatus.CONFIRMED,
          scheduledAt: apptScheduledB,
        },
      });
      apptB = {
        id: createdB.id,
        scheduledAt: createdB.scheduledAt!,
        status: createdB.status,
      };
    });

    // Cita fresca de A en el estado pedido, para el camino de API key.
    async function freshApptA(
      status: AppointmentStatus,
      scheduledAt: Date | null = null,
    ): Promise<string> {
      const created = await prisma.appointment.create({
        data: {
          tenantId: tenantA,
          leadId: leadAApptId,
          status,
          scheduledAt,
        },
      });
      return created.id;
    }

    async function expectApptBUnchanged(): Promise<void> {
      const after = await prisma.appointment.findUniqueOrThrow({
        where: { id: apptB.id },
      });
      expect(after.status).toBe(apptB.status);
      expect(after.scheduledAt?.toISOString()).toBe(
        apptB.scheduledAt.toISOString(),
      );
      expect(after.tenantId).toBe(tenantB);
    }

    describe('(a) sesión de A contra URL de B → 403, sin exponer ni modificar la cita de B', () => {
      it('GET appointments: A contra B → 403 sin listar citas de B', async () => {
        const res = await request(app.getHttpServer())
          .get(apptsUrl(tenantB))
          .set(bearer(ownerTokenA))
          .expect(403);
        expect(JSON.stringify(res.body)).not.toContain(apptB.id);
      });

      it('GET appointments: también con rol AGENT del tenant A → 403', async () => {
        await request(app.getHttpServer())
          .get(apptsUrl(tenantB))
          .set(bearer(agentTokenA))
          .expect(403);
      });

      for (const action of transitionActions) {
        it(`POST ${action.path}: A contra B → 403 y la cita de B no muta`, async () => {
          const res = await request(app.getHttpServer())
            .post(`${apptsUrl(tenantB)}/${apptB.id}/${action.path}`)
            .set(bearer(ownerTokenA))
            .send(action.body)
            .expect(403);
          expect(JSON.stringify(res.body)).not.toContain(apptB.id);
          await expectApptBUnchanged();
        });
      }

      it('POST cancel: también con rol AGENT del tenant A → 403 y B no muta', async () => {
        await request(app.getHttpServer())
          .post(`${apptsUrl(tenantB)}/${apptB.id}/cancel`)
          .set(bearer(agentTokenA))
          .send({})
          .expect(403);
        await expectApptBUnchanged();
      });
    });

    describe('(b) camino de API key sigue funcionando igual en los 6 endpoints', () => {
      it('GET appointments: la API key del tenant lista sus citas', async () => {
        await request(app.getHttpServer())
          .get(apptsUrl(tenantA))
          .set('X-Api-Key', apiKeyA)
          .expect(200);
      });

      it('POST confirm: PROPOSED → CONFIRMED por API key', async () => {
        const aid = await freshApptA(AppointmentStatus.PROPOSED);
        const res = await request(app.getHttpServer())
          .post(`${apptsUrl(tenantA)}/${aid}/confirm`)
          .set('X-Api-Key', apiKeyA)
          .send({ scheduledAt: futureDate })
          .expect(200);
        expect((res.body as { status: string }).status).toBe(
          AppointmentStatus.CONFIRMED,
        );
      });

      it('POST reschedule: CONFIRMED → actualiza scheduledAt por API key', async () => {
        const aid = await freshApptA(
          AppointmentStatus.CONFIRMED,
          new Date(futureDate),
        );
        await request(app.getHttpServer())
          .post(`${apptsUrl(tenantA)}/${aid}/reschedule`)
          .set('X-Api-Key', apiKeyA)
          .send({ scheduledAt: '2026-12-05T09:00:00.000Z' })
          .expect(200);
      });

      it('POST cancel: PROPOSED → CANCELLED por API key', async () => {
        const aid = await freshApptA(AppointmentStatus.PROPOSED);
        const res = await request(app.getHttpServer())
          .post(`${apptsUrl(tenantA)}/${aid}/cancel`)
          .set('X-Api-Key', apiKeyA)
          .send({})
          .expect(200);
        expect((res.body as { status: string }).status).toBe(
          AppointmentStatus.CANCELLED,
        );
      });

      it('POST done: CONFIRMED → DONE por API key', async () => {
        const aid = await freshApptA(
          AppointmentStatus.CONFIRMED,
          new Date(futureDate),
        );
        const res = await request(app.getHttpServer())
          .post(`${apptsUrl(tenantA)}/${aid}/done`)
          .set('X-Api-Key', apiKeyA)
          .send({ outcome: 'ok' })
          .expect(200);
        expect((res.body as { status: string }).status).toBe(
          AppointmentStatus.DONE,
        );
      });

      it('POST no-show: CONFIRMED → NO_SHOW por API key', async () => {
        const aid = await freshApptA(
          AppointmentStatus.CONFIRMED,
          new Date(futureDate),
        );
        const res = await request(app.getHttpServer())
          .post(`${apptsUrl(tenantA)}/${aid}/no-show`)
          .set('X-Api-Key', apiKeyA)
          .send({})
          .expect(200);
        expect((res.body as { status: string }).status).toBe(
          AppointmentStatus.NO_SHOW,
        );
      });
    });

    describe('(c) confirm con assignedUserId de otro tenant → 400, no 404', () => {
      it('sesión de A confirma una cita de A con assignedUserId de B → 400 y la cita de A no cambia', async () => {
        const aid = await freshApptA(AppointmentStatus.PROPOSED);
        await request(app.getHttpServer())
          .post(`${apptsUrl(tenantA)}/${aid}/confirm`)
          .set(bearer(ownerTokenA))
          .send({ scheduledAt: futureDate, assignedUserId: personBId })
          .expect(400);
        const unchanged = await prisma.appointment.findUniqueOrThrow({
          where: { id: aid },
        });
        expect(unchanged.status).toBe(AppointmentStatus.PROPOSED);
        expect(unchanged.assignedUserId).toBeNull();
      });
    });
  });
});
