import { randomBytes } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
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
});
