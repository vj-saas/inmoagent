import { createHmac, randomBytes } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type Redis from 'ioredis';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { REDIS_CLIENT } from '../src/common/redis.module';
import { PrismaService } from '../src/prisma/prisma.service';
import textFixture from './fixtures/meta/text.json';

/**
 * Spec V-C (specs/V-C-onboarding-tenant/spec.md) — T19: recorrido completo del
 * wizard de onboarding replicando EXACTAMENTE las llamadas HTTP que hace el
 * navegador, sin `psql` ni CLI de por medio.
 *
 * Que los pasos 1-7 sean todos HTTP es, en sí mismo, la verificación de AC-13
 * ("una inmobiliaria queda operativa sin intervención manual fuera de la app").
 * Prisma se usa solo para *verificar* estado, nunca para preparar el fixture.
 *
 * ACs: AC-13 (flujo 100% HTTP), AC-14 (el tenant recién creado responde el
 * webhook igual que uno preexistente), AC-15 (import CSV parcial con reporte
 * de errores por fila).
 *
 * Los `it` comparten estado por variables del `describe` y se ejecutan en
 * orden (Jest corre los tests de un archivo secuencialmente): cada paso
 * depende del anterior, igual que el usuario en el wizard.
 */

const CSV_HEADER =
  'external_ref,title,description,operation,property_type,price,currency,expenses,neighborhood,city,address,rooms,bedrooms,bathrooms,area_m2,garage,pets_allowed,features,listing_url,photo_urls';

interface CreateTenantResponseBody {
  tenantId: string;
  apiKey: string;
}
interface PersonResponseBody {
  id: string;
  email: string;
  role: 'OWNER' | 'AGENT';
}
interface LoginResponseBody {
  token: string;
}
interface ImportResponseBody {
  imported: number;
  errors: Array<{ row: number; message: string }>;
}
interface TenantConfigBody {
  id: string;
  welcomeIntro: string | null;
  humanHours: string | null;
}
interface WebhookStatusBody {
  connected: boolean;
  lastEventAt: string | null;
  lastMessageAt: string | null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('Onboarding wizard: alta de tenant 100% por HTTP (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let redis: Redis;

  const masterKey = process.env.ADMIN_MASTER_KEY ?? 'dev-admin-master-key';
  const appSecret = process.env.META_APP_SECRET ?? 'dev-meta-app-secret';
  const suffix = randomBytes(4).toString('hex');

  const phoneNumberId = `wizard-phone-${suffix}`;
  const ownerEmail = `owner-wizard-${suffix}@test.com`;
  const ownerPassword = 'password123';
  const leadPhone = `549111${suffix}7`;
  const waMessageId = `wamid.wizard-${suffix}`;

  // Estado que se va encadenando paso a paso (lo que el wizard guarda en el navegador).
  let tenantId: string;
  let apiKey: string;
  let ownerToken: string;

  const validRefs = [`wizard-ok-1-${suffix}`, `wizard-ok-2-${suffix}`];
  const invalidRefs = [`wizard-bad-op-${suffix}`, `wizard-bad-price-${suffix}`];

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    // `rawBody: true` + ValidationPipe: misma configuración que `src/main.ts`,
    // necesaria para que la firma HMAC del webhook se valide sobre los bytes
    // crudos y no sobre el JSON re-serializado.
    app = moduleFixture.createNestApplication({ rawBody: true });
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();

    prisma = app.get(PrismaService);
    redis = app.get(REDIS_CLIENT);
  });

  afterAll(async () => {
    if (tenantId) {
      // `WebhookEvent.tenantId` no tiene FK contra `Tenant`: no cascadea, hay
      // que limpiarlo a mano. Lead/Message/Property/Person sí cascadean.
      await prisma.webhookEvent.deleteMany({ where: { tenantId } });
      await prisma.tenant.deleteMany({ where: { id: tenantId } });
    }
    await app.close();
  });

  function sign(rawBody: string, secret = appSecret): string {
    return `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`;
  }

  /** Clona el fixture de Meta y lo reapunta al tenant recién creado por el wizard. */
  function buildWebhookPayload(): typeof textFixture {
    const payload = JSON.parse(
      JSON.stringify(textFixture),
    ) as typeof textFixture;
    const value = payload.entry[0].changes[0].value;
    value.metadata.phone_number_id = phoneNumberId;
    value.messages[0].id = waMessageId;
    value.messages[0].from = leadPhone;
    value.contacts[0].wa_id = leadPhone;
    return payload;
  }

  /**
   * El encolado se verifica igual que en `test/webhook.e2e-spec.ts`: el worker
   * de `inbound` consume el job casi al instante, así que la señal observable
   * de que el job se encoló Y se procesó es que el mensaje llegó al buffer de
   * debounce del lead en Redis.
   */
  async function waitForDebounceBufferLength(
    expectedLength: number,
    timeoutMs = 5000,
  ): Promise<number> {
    const deadline = Date.now() + timeoutMs;
    let lastLength = -1;
    while (Date.now() < deadline) {
      const lead = await prisma.lead.findUnique({
        where: { tenantId_phone: { tenantId, phone: leadPhone } },
      });
      if (lead) {
        lastLength = await redis.llen(`debounce:${tenantId}:${lead.id}`);
        if (lastLength >= expectedLength) {
          return lastLength;
        }
      }
      await sleep(50);
    }
    return lastLength;
  }

  it('paso 1: POST /admin/tenants con X-Master-Key crea el tenant y devuelve la API key', async () => {
    const response = await request(app.getHttpServer())
      .post('/admin/tenants')
      .set('X-Master-Key', masterKey)
      .send({
        name: `Inmobiliaria Wizard ${suffix}`,
        slug: `wizard-${suffix}`,
        phoneNumberId,
        wabaId: `wizard-waba-${suffix}`,
        accessToken: 'meta-token-en-claro-del-wizard',
        displayPhone: '+5491100000000',
        botName: 'Sofía',
        botTone: 'cordial y directo',
        humanHours: 'Lunes a viernes de 9 a 18',
        coverageAreas: ['Caballito'],
      })
      .expect(201);

    const body = response.body as CreateTenantResponseBody;
    expect(typeof body.tenantId).toBe('string');
    expect(body.apiKey).toMatch(/^live_[0-9a-f]{48}$/);

    tenantId = body.tenantId;
    apiKey = body.apiKey;

    // El token de Meta se guarda cifrado, nunca en claro (CLAUDE.md).
    const fresh = await prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
    });
    expect(fresh.accessTokenEnc).not.toContain(
      'meta-token-en-claro-del-wizard',
    );
    expect(fresh.apiKeyHash).not.toBe(apiKey);
    expect(fresh.phoneNumberId).toBe(phoneNumberId);
  });

  it('paso 2: POST :id/people/bootstrap-owner con X-Master-Key crea el OWNER', async () => {
    const response = await request(app.getHttpServer())
      .post(`/admin/tenants/${tenantId}/people/bootstrap-owner`)
      .set('X-Master-Key', masterKey)
      .send({ email: ownerEmail, password: ownerPassword })
      .expect(201);

    const body = response.body as PersonResponseBody;
    expect(body.email).toBe(ownerEmail);
    expect(body.role).toBe('OWNER');
    // La contraseña nunca vuelve en la respuesta, ni en claro ni hasheada.
    expect(JSON.stringify(response.body)).not.toContain(ownerPassword);
  });

  it('paso 3: POST /auth/login con las credenciales del OWNER devuelve el token de sesión', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: ownerEmail, password: ownerPassword })
      .expect(200);

    const body = response.body as LoginResponseBody;
    expect(typeof body.token).toBe('string');
    expect(body.token.length).toBeGreaterThan(0);
    ownerToken = body.token;
  });

  it('paso 4 (AC-15): POST :id/properties/import sube un CSV mixto, importa las válidas y reporta las inválidas por fila', async () => {
    const rows = [
      CSV_HEADER,
      // fila 2 — válida
      `${validRefs[0]},Depto 2 amb en Caballito,luminoso,alquiler,departamento,300000,ARS,,caballito,CABA,,2,1,1,45,si,no,balcon,,`,
      // fila 3 — válida
      `${validRefs[1]},PH 3 amb en Caballito,con patio,venta,ph,120000,USD,,caballito,CABA,,3,2,1,70,no,si,patio,,`,
      // fila 4 — operation inválida
      `${invalidRefs[0]},Depto con operación rara,,permuta,departamento,150000,ARS,,caballito,CABA,,2,1,1,40,,,,,`,
      // fila 5 — sin external_ref
      `,Depto sin referencia,,alquiler,departamento,200000,ARS,,caballito,CABA,,2,1,1,42,,,,,`,
      // fila 6 — price inválido
      `${invalidRefs[1]},Depto con precio roto,,alquiler,departamento,no-es-un-numero,ARS,,caballito,CABA,,2,1,1,44,,,,,`,
    ];

    const response = await request(app.getHttpServer())
      .post(`/admin/tenants/${tenantId}/properties/import`)
      .set('X-Api-Key', apiKey)
      .attach('file', Buffer.from(rows.join('\n'), 'utf-8'), 'inventario.csv')
      .expect(200);

    const result = response.body as ImportResponseBody;
    expect(result.imported).toBeGreaterThanOrEqual(1);
    expect(result.imported).toBe(2);

    // Cada fila inválida se reporta con número de fila (1-indexado, contando el
    // encabezado) y un motivo legible.
    expect(result.errors).toHaveLength(3);
    expect(result.errors.map((e) => e.row).sort((a, b) => a - b)).toEqual([
      4, 5, 6,
    ]);
    for (const error of result.errors) {
      expect(typeof error.message).toBe('string');
      expect(error.message.length).toBeGreaterThan(0);
    }
    const byRow = new Map(result.errors.map((e) => [e.row, e.message]));
    expect(byRow.get(4)).toContain('operation');
    expect(byRow.get(5)).toContain('external_ref');
    expect(byRow.get(6)).toContain('price');

    // Verificación en DB: solo las válidas se crearon, y solo para este tenant.
    const properties = await prisma.property.findMany({ where: { tenantId } });
    expect(properties).toHaveLength(2);
    expect(properties.map((p) => p.externalRef).sort()).toEqual(
      [...validRefs].sort(),
    );

    const orphans = await prisma.property.findMany({
      where: { externalRef: { in: invalidRefs } },
    });
    expect(orphans).toHaveLength(0);
  });

  it('paso 5: PATCH :id/config con el token del OWNER actualiza la configuración', async () => {
    const welcomeIntro = 'Hola, somos la Inmobiliaria Wizard.';
    const humanHours = 'Lunes a sábado de 10 a 19';

    const response = await request(app.getHttpServer())
      .patch(`/admin/tenants/${tenantId}/config`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ welcomeIntro, humanHours })
      .expect(200);

    const body = response.body as TenantConfigBody;
    expect(body.welcomeIntro).toBe(welcomeIntro);
    expect(body.humanHours).toBe(humanHours);
    expect(body).not.toHaveProperty('accessTokenEnc');
    expect(body).not.toHaveProperty('apiKeyHash');

    const fresh = await prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
    });
    expect(fresh.welcomeIntro).toBe(welcomeIntro);
    expect(fresh.humanHours).toBe(humanHours);
    // Los secretos y la identidad del tenant no se tocan desde `config`.
    expect(fresh.phoneNumberId).toBe(phoneNumberId);
  });

  it('paso 6 (AC-14): el webhook de Meta contra el tenant recién creado responde 200, crea el Lead, persiste el Message IN y encola el job', async () => {
    const payload = buildWebhookPayload();
    const raw = JSON.stringify(payload);

    const response = await request(app.getHttpServer())
      .post('/webhook/whatsapp')
      .set('X-Hub-Signature-256', sign(raw))
      .send(payload)
      .expect(200);
    expect(response.body).toEqual({ received: true });

    // El lead se creó resuelto por phoneNumberId → tenant nuevo, sin ayuda manual.
    const lead = await prisma.lead.findUnique({
      where: { tenantId_phone: { tenantId, phone: leadPhone } },
    });
    expect(lead).not.toBeNull();
    expect(lead?.tenantId).toBe(tenantId);

    const message = await prisma.message.findUnique({
      where: { waMessageId },
    });
    expect(message).not.toBeNull();
    expect(message?.tenantId).toBe(tenantId);
    expect(message?.leadId).toBe(lead?.id);
    expect(message?.direction).toBe('IN');
    expect(message?.body).toBe('Hola, busco depto de 2 ambientes en Caballito');

    // El job se encoló (y el worker lo consumió hasta el buffer de debounce).
    const bufferLength = await waitForDebounceBufferLength(1);
    expect(bufferLength).toBe(1);
  }, 15000);

  it('paso 7: GET :id/webhook-status con el token del OWNER reporta connected:true inmediatamente después del webhook', async () => {
    // `WebhookController.receive()` espera a `handlePayload()` antes de
    // responder 200, y el `WebhookEvent` se persiste ahí (idempotencia) antes
    // de encolar: no hace falta esperar al procesamiento asíncrono.
    const response = await request(app.getHttpServer())
      .get(`/admin/tenants/${tenantId}/webhook-status`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    const body = response.body as WebhookStatusBody;
    expect(body.connected).toBe(true);
    expect(body.lastEventAt).not.toBeNull();

    const event = await prisma.webhookEvent.findUnique({
      where: { waMessageId },
    });
    expect(event).not.toBeNull();
    expect(event?.tenantId).toBe(tenantId);
  });
});
