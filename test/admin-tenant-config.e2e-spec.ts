import { randomBytes } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as argon2 from 'argon2';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Spec V-C (specs/V-C-onboarding-tenant/spec.md) — configuración editable del
 * tenant y estado de conexión del webhook, con foco en aislamiento
 * multi-tenant.
 *
 * Rutas cubiertas:
 *  - PATCH /admin/tenants/:tenantId/config          (Bearer, solo OWNER del propio tenant)
 *  - GET   /admin/tenants/:tenantId/webhook-status  (Bearer, OWNER y AGENT del propio tenant)
 *
 * ACs: AC-1, AC-2, AC-3, AC-4, AC-9, AC-10, AC-11, AC-12.
 */

interface TenantConfigBody {
  id: string;
  name: string;
  slug: string;
  phoneNumberId: string;
  wabaId: string | null;
  displayPhone: string | null;
  botName: string;
  botTone: string;
  schedulingLink: string | null;
  humanHours: string | null;
  competitorsToAvoid: string[];
  coverageAreas: string[];
  welcomeIntro: string | null;
  handoffIntro: string | null;
  alertPhone: string | null;
  alertsEnabled: boolean;
}

interface WebhookStatusBody {
  connected: boolean;
  lastEventAt: string | null;
  lastMessageAt: string | null;
}

interface PersonResponseBody {
  id: string;
  email: string;
  role: 'OWNER' | 'AGENT';
}

interface LoginResponseBody {
  token: string;
}

describe('Admin: config de tenant y webhook-status (e2e)', () => {
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
    // `WebhookEvent.tenantId` no tiene FK contra `Tenant` (es nullable y sin
    // relación en el schema), así que NO se borra en cascada: hay que
    // limpiarlo a mano antes de borrar los tenants.
    await prisma.webhookEvent.deleteMany({
      where: { tenantId: { in: tenantIds } },
    });
    await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    await app.close();
  });

  /** Crea el tenant directo por Prisma (no por HTTP) con secretos dummy conocidos. */
  async function createTenant(label: string) {
    const key = label.toLowerCase();
    const tenant = await prisma.tenant.create({
      data: {
        name: `Config Tenant ${label}`,
        slug: `config-${key}-${suffix}`,
        phoneNumberId: `config-phone-${key}-${suffix}`,
        wabaId: `config-waba-${key}-${suffix}`,
        accessTokenEnc: `enc-token-${key}-${suffix}`,
        apiKeyHash: await argon2.hash(`irrelevant-api-key-${key}-${suffix}`),
        displayPhone: '+5491100000000',
        botName: 'Bot Original',
        botTone: 'tono original',
        schedulingLink: 'https://cal.example.com/original',
        humanHours: 'Lunes a viernes de 9 a 18',
        coverageAreas: ['Palermo'],
        competitorsToAvoid: ['Competidor Original'],
        alertPhone: '5491100000001',
        alertsEnabled: false,
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
    const email = `owner-config-${label.toLowerCase()}-${suffix}@test.com`;
    await bootstrapOwner(tenant.id, email).expect(201);
    const loginRes = await login(email).expect(200);
    const ownerToken = (loginRes.body as LoginResponseBody).token;
    return { tenant, ownerEmail: email, ownerToken };
  }

  /** Crea un AGENT con contraseña conocida y devuelve su token de sesión. */
  async function createAgentToken(
    tenantId: string,
    ownerToken: string,
    label: string,
  ) {
    const email = `agent-config-${label.toLowerCase()}-${suffix}@test.com`;
    const created = await request(app.getHttpServer())
      .post(`/admin/tenants/${tenantId}/people`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ email, role: 'AGENT', password: 'password123' })
      .expect(201);
    expect((created.body as PersonResponseBody).role).toBe('AGENT');
    const loginRes = await login(email).expect(200);
    return (loginRes.body as LoginResponseBody).token;
  }

  function patchConfig(tenantId: string, token: string, payload: object) {
    return request(app.getHttpServer())
      .patch(`/admin/tenants/${tenantId}/config`)
      .set('Authorization', `Bearer ${token}`)
      .send(payload);
  }

  function getWebhookStatus(tenantId: string, token: string) {
    return request(app.getHttpServer())
      .get(`/admin/tenants/${tenantId}/webhook-status`)
      .set('Authorization', `Bearer ${token}`);
  }

  it('AC-1: un OWNER actualiza solo los campos enviados y la respuesta no expone secretos', async () => {
    const { tenant, ownerToken } = await setupTenantWithOwner('patch-ok');

    const res = await patchConfig(tenant.id, ownerToken, {
      botName: 'Bot Nuevo',
      alertPhone: '5491199998888',
      alertsEnabled: true,
    }).expect(200);
    const body = res.body as TenantConfigBody;

    expect(body.botName).toBe('Bot Nuevo');
    expect(body.alertPhone).toBe('5491199998888');
    expect(body.alertsEnabled).toBe(true);

    // La respuesta nunca puede contener los secretos del tenant.
    expect(body).not.toHaveProperty('accessTokenEnc');
    expect(body).not.toHaveProperty('apiKeyHash');
    expect(JSON.stringify(res.body)).not.toContain(tenant.accessTokenEnc);
    expect(JSON.stringify(res.body)).not.toContain(tenant.apiKeyHash);

    // Releído de la DB: solo cambiaron los tres campos enviados.
    const fresh = await prisma.tenant.findUniqueOrThrow({
      where: { id: tenant.id },
    });
    expect(fresh.botName).toBe('Bot Nuevo');
    expect(fresh.alertPhone).toBe('5491199998888');
    expect(fresh.alertsEnabled).toBe(true);
    expect(fresh.botTone).toBe(tenant.botTone);
    expect(fresh.humanHours).toBe(tenant.humanHours);
    expect(fresh.schedulingLink).toBe(tenant.schedulingLink);
    expect(fresh.displayPhone).toBe(tenant.displayPhone);
    expect(fresh.coverageAreas).toEqual(tenant.coverageAreas);
    expect(fresh.competitorsToAvoid).toEqual(tenant.competitorsToAvoid);
    expect(fresh.welcomeIntro).toBeNull();
    expect(fresh.handoffIntro).toBeNull();
    expect(fresh.accessTokenEnc).toBe(tenant.accessTokenEnc);
    expect(fresh.apiKeyHash).toBe(tenant.apiKeyHash);
  });

  it('AC-2: un AGENT recibe 403 y la configuración del tenant no cambia', async () => {
    const { tenant, ownerToken } = await setupTenantWithOwner('agent-403');
    const agentToken = await createAgentToken(
      tenant.id,
      ownerToken,
      'agent-403',
    );

    await patchConfig(tenant.id, agentToken, {
      botName: 'Bot Del Agente',
      humanHours: 'Horario cambiado por un AGENT',
    }).expect(403);

    const fresh = await prisma.tenant.findUniqueOrThrow({
      where: { id: tenant.id },
    });
    expect(fresh.botName).toBe(tenant.botName);
    expect(fresh.humanHours).toBe(tenant.humanHours);
  });

  it('AC-3: los campos no editables del body se descartan y los valores protegidos quedan intactos', async () => {
    const { tenant, ownerToken } = await setupTenantWithOwner('no-editables');

    const res = await patchConfig(tenant.id, ownerToken, {
      botTone: 'tono nuevo',
      accessToken: 'token-en-claro-del-atacante',
      phoneNumberId: 'phone-number-id-secuestrado',
      wabaId: 'waba-secuestrado',
      slug: 'slug-secuestrado',
      apiKeyHash: 'hash-plantado',
    }).expect(200);
    const body = res.body as TenantConfigBody;

    expect(body.botTone).toBe('tono nuevo');
    expect(body.phoneNumberId).toBe(tenant.phoneNumberId);
    expect(body.wabaId).toBe(tenant.wabaId);
    expect(body.slug).toBe(tenant.slug);

    const fresh = await prisma.tenant.findUniqueOrThrow({
      where: { id: tenant.id },
    });
    expect(fresh.botTone).toBe('tono nuevo');
    // Carácter a carácter: el token cifrado no puede haber sido tocado.
    expect(fresh.accessTokenEnc).toBe(tenant.accessTokenEnc);
    expect(fresh.apiKeyHash).toBe(tenant.apiKeyHash);
    expect(fresh.phoneNumberId).toBe(tenant.phoneNumberId);
    expect(fresh.wabaId).toBe(tenant.wabaId);
    expect(fresh.slug).toBe(tenant.slug);
  });

  it('AC-4: el OWNER del tenant A no puede tocar la config del tenant B (403)', async () => {
    const { ownerToken: tokenA } = await setupTenantWithOwner('cross-a');
    const { tenant: tenantB } = await setupTenantWithOwner('cross-b');

    await patchConfig(tenantB.id, tokenA, {
      botName: 'Bot Intruso',
      alertPhone: '5491100000099',
    }).expect(403);

    const freshB = await prisma.tenant.findUniqueOrThrow({
      where: { id: tenantB.id },
    });
    expect(freshB.botName).toBe(tenantB.botName);
    expect(freshB.alertPhone).toBe(tenantB.alertPhone);
  });

  it('welcomeIntro vacío borra el valor previo (queda null en DB)', async () => {
    const { tenant, ownerToken } = await setupTenantWithOwner('welcome-clear');

    await patchConfig(tenant.id, ownerToken, {
      welcomeIntro: 'Hola, somos la inmobiliaria de siempre.',
    }).expect(200);
    const set = await prisma.tenant.findUniqueOrThrow({
      where: { id: tenant.id },
    });
    expect(set.welcomeIntro).toBe('Hola, somos la inmobiliaria de siempre.');

    const res = await patchConfig(tenant.id, ownerToken, {
      welcomeIntro: '',
    }).expect(200);
    expect((res.body as TenantConfigBody).welcomeIntro).toBeNull();

    const cleared = await prisma.tenant.findUniqueOrThrow({
      where: { id: tenant.id },
    });
    expect(cleared.welcomeIntro).toBeNull();
  });

  it('AC-9: un tenant sin eventos ni leads reporta connected:false y ambas fechas en null', async () => {
    const { tenant, ownerToken } = await setupTenantWithOwner('status-empty');

    const res = await getWebhookStatus(tenant.id, ownerToken).expect(200);
    expect(res.body as WebhookStatusBody).toEqual({
      connected: false,
      lastEventAt: null,
      lastMessageAt: null,
    });
  });

  it('AC-10: con eventos de webhook reporta connected:true y lastEventAt del más reciente', async () => {
    const { tenant, ownerToken } = await setupTenantWithOwner('status-events');
    const older = new Date('2026-01-10T10:00:00.000Z');
    const newer = new Date('2026-02-15T18:30:00.000Z');

    await prisma.webhookEvent.createMany({
      data: [
        {
          waMessageId: `wamid-old-${suffix}`,
          tenantId: tenant.id,
          receivedAt: older,
        },
        {
          waMessageId: `wamid-new-${suffix}`,
          tenantId: tenant.id,
          receivedAt: newer,
        },
      ],
    });

    const res = await getWebhookStatus(tenant.id, ownerToken).expect(200);
    const body = res.body as WebhookStatusBody;
    expect(body.connected).toBe(true);
    expect(body.lastEventAt).toBe(newer.toISOString());
    expect(body.lastMessageAt).toBeNull();
  });

  it('AC-11: lastMessageAt es el máximo de los no nulos, ignorando leads con lastMessageAt null', async () => {
    const { tenant, ownerToken } = await setupTenantWithOwner('status-leads');
    const older = new Date('2026-03-01T09:00:00.000Z');
    const newer = new Date('2026-03-20T21:45:00.000Z');

    await prisma.lead.createMany({
      data: [
        {
          tenantId: tenant.id,
          phone: `5491100001${suffix.slice(0, 3)}`,
          lastMessageAt: older,
        },
        {
          tenantId: tenant.id,
          phone: `5491100002${suffix.slice(0, 3)}`,
          lastMessageAt: newer,
        },
        // Lead sin actividad: con `NULLS FIRST` de Postgres, un `orderBy desc`
        // sin el filtro `not: null` devolvería este y rompería el AC.
        {
          tenantId: tenant.id,
          phone: `5491100003${suffix.slice(0, 3)}`,
          lastMessageAt: null,
        },
      ],
    });

    const res = await getWebhookStatus(tenant.id, ownerToken).expect(200);
    const body = res.body as WebhookStatusBody;
    expect(body.connected).toBe(true);
    expect(body.lastMessageAt).toBe(newer.toISOString());
    expect(body.lastEventAt).toBeNull();
  });

  it('AC-12: una sesión del tenant A no puede leer el webhook-status del tenant B (403)', async () => {
    const { ownerToken: tokenA } = await setupTenantWithOwner('status-cross-a');
    const { tenant: tenantB, ownerToken: tokenB } =
      await setupTenantWithOwner('status-cross-b');
    const agentB = await createAgentToken(
      tenantB.id,
      tokenB,
      'status-cross-b-agent',
    );

    await prisma.webhookEvent.create({
      data: {
        waMessageId: `wamid-cross-b-${suffix}`,
        tenantId: tenantB.id,
        receivedAt: new Date('2026-04-05T12:00:00.000Z'),
      },
    });

    const res = await getWebhookStatus(tenantB.id, tokenA).expect(403);
    expect(JSON.stringify(res.body)).not.toContain('2026-04-05');

    // El AGENT del propio tenant B sí lo ve: el 403 es por aislamiento, no
    // porque el endpoint esté roto.
    const okRes = await getWebhookStatus(tenantB.id, agentB).expect(200);
    expect((okRes.body as WebhookStatusBody).connected).toBe(true);
  });

  it('webhook-status es accesible con rol AGENT (no lleva OwnerRoleGuard)', async () => {
    const { tenant, ownerToken } = await setupTenantWithOwner('status-agent');
    const agentToken = await createAgentToken(
      tenant.id,
      ownerToken,
      'status-agent',
    );

    const res = await getWebhookStatus(tenant.id, agentToken).expect(200);
    expect(res.body as WebhookStatusBody).toEqual({
      connected: false,
      lastEventAt: null,
      lastMessageAt: null,
    });

    // Contraste explícito: el mismo AGENT no puede tocar `config`.
    await patchConfig(tenant.id, agentToken, { botName: 'Bot' }).expect(403);
  });
});
