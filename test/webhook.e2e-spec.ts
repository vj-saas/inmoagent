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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('Webhook de WhatsApp (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let redis: Redis;
  const appSecret = process.env.META_APP_SECRET ?? 'dev-meta-app-secret';
  const suffix = randomBytes(4).toString('hex');
  const testPhoneNumberId = `test-phone-number-id-${suffix}`;
  let tenantId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication({ rawBody: true });
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();

    prisma = app.get(PrismaService);
    redis = app.get(REDIS_CLIENT);

    const tenant = await prisma.tenant.create({
      data: {
        name: 'Webhook Test Tenant',
        slug: `webhook-test-${suffix}`,
        phoneNumberId: testPhoneNumberId,
        accessTokenEnc: 'irrelevante-para-este-test',
        apiKeyHash: 'irrelevante-para-este-test',
      },
    });
    tenantId = tenant.id;
  });

  afterAll(async () => {
    await prisma.tenant.delete({ where: { id: tenantId } });
    await app.close();
  });

  function buildPayload(
    messageId: string,
    fromPhone: string,
  ): typeof textFixture {
    const payload = JSON.parse(
      JSON.stringify(textFixture),
    ) as typeof textFixture;
    payload.entry[0].changes[0].value.metadata.phone_number_id =
      testPhoneNumberId;
    payload.entry[0].changes[0].value.messages[0].id = messageId;
    payload.entry[0].changes[0].value.messages[0].from = fromPhone;
    payload.entry[0].changes[0].value.contacts[0].wa_id = fromPhone;
    return payload;
  }

  function sign(rawBody: string, secret = appSecret): string {
    return `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`;
  }

  /**
   * El pipeline de la Fase 3 consume `inbound` en tiempo real: en vez de
   * contar jobs en la cola (que ahora se procesan casi al instante), se
   * espera a que el mensaje llegue al buffer de debounce del lead en Redis,
   * que es la señal de que el job efectivamente se encoló y se procesó.
   */
  async function waitForDebounceBufferLength(
    phone: string,
    expectedLength: number,
    timeoutMs = 3000,
  ): Promise<number> {
    const deadline = Date.now() + timeoutMs;
    let lastLength = -1;
    while (Date.now() < deadline) {
      const lead = await prisma.lead.findUnique({
        where: { tenantId_phone: { tenantId, phone } },
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

  it('GET con hub.verify_token correcto hace eco de hub.challenge', async () => {
    const verifyToken = process.env.META_VERIFY_TOKEN ?? 'dev-verify-token';

    const response = await request(app.getHttpServer())
      .get('/webhook/whatsapp')
      .query({
        'hub.mode': 'subscribe',
        'hub.verify_token': verifyToken,
        'hub.challenge': 'challenge-123',
      })
      .expect(200);

    expect(response.text).toBe('challenge-123');
  });

  it('GET con hub.verify_token incorrecto responde 403', async () => {
    await request(app.getHttpServer())
      .get('/webhook/whatsapp')
      .query({
        'hub.mode': 'subscribe',
        'hub.verify_token': 'token-incorrecto',
        'hub.challenge': 'challenge-123',
      })
      .expect(403);
  });

  it('POST con firma válida responde 200, persiste el mensaje y lo encola (llega al buffer de debounce)', async () => {
    const messageId = `wamid.e2e-valid-${suffix}`;
    const fromPhone = `549111${suffix}1`;
    const payload = buildPayload(messageId, fromPhone);
    const raw = JSON.stringify(payload);

    const response = await request(app.getHttpServer())
      .post('/webhook/whatsapp')
      .set('X-Hub-Signature-256', sign(raw))
      .send(payload)
      .expect(200);

    expect(response.body).toEqual({ received: true });

    const message = await prisma.message.findUnique({
      where: { waMessageId: messageId },
    });
    expect(message).not.toBeNull();
    expect(message?.body).toBe('Hola, busco depto de 2 ambientes en Caballito');
    expect(message?.tenantId).toBe(tenantId);

    const bufferLength = await waitForDebounceBufferLength(fromPhone, 1);
    expect(bufferLength).toBe(1);
  }, 10000);

  it('POST con firma inválida responde 401 y no persiste nada', async () => {
    const messageId = `wamid.e2e-invalid-sig-${suffix}`;
    const payload = buildPayload(messageId, `549111${suffix}2`);
    const raw = JSON.stringify(payload);

    await request(app.getHttpServer())
      .post('/webhook/whatsapp')
      .set('X-Hub-Signature-256', sign(raw, 'un-secreto-incorrecto'))
      .send(payload)
      .expect(401);

    const message = await prisma.message.findUnique({
      where: { waMessageId: messageId },
    });
    expect(message).toBeNull();
  });

  it('el mismo wa_message_id enviado dos veces genera un solo registro y un solo mensaje en el buffer', async () => {
    const messageId = `wamid.e2e-dup-${suffix}`;
    const fromPhone = `549111${suffix}3`;
    const payload = buildPayload(messageId, fromPhone);
    const raw = JSON.stringify(payload);
    const signature = sign(raw);

    await request(app.getHttpServer())
      .post('/webhook/whatsapp')
      .set('X-Hub-Signature-256', signature)
      .send(payload)
      .expect(200);

    await waitForDebounceBufferLength(fromPhone, 1);

    // Simula un retry de Meta: mismo payload, misma firma, mismo wa_message_id.
    await request(app.getHttpServer())
      .post('/webhook/whatsapp')
      .set('X-Hub-Signature-256', signature)
      .send(payload)
      .expect(200);

    await sleep(300); // margen para que, si hubiera un segundo procesamiento indebido, ya haya ocurrido

    const messages = await prisma.message.findMany({
      where: { waMessageId: messageId },
    });
    expect(messages).toHaveLength(1);

    const lead = await prisma.lead.findUnique({
      where: { tenantId_phone: { tenantId, phone: fromPhone } },
    });
    const bufferLength = await redis.llen(`debounce:${tenantId}:${lead!.id}`);
    expect(bufferLength).toBe(1);
  }, 10000);

  it('p95 del tiempo de respuesta del webhook está por debajo de 500ms', async () => {
    const REQUEST_COUNT = 25;
    const durationsMs: number[] = [];

    for (let i = 0; i < REQUEST_COUNT; i++) {
      const payload = buildPayload(
        `wamid.e2e-perf-${suffix}-${i}`,
        `549111${suffix}9${i}`,
      );
      const raw = JSON.stringify(payload);
      const startedAt = Date.now();

      await request(app.getHttpServer())
        .post('/webhook/whatsapp')
        .set('X-Hub-Signature-256', sign(raw))
        .send(payload)
        .expect(200);

      durationsMs.push(Date.now() - startedAt);
    }

    durationsMs.sort((a, b) => a - b);
    const p95Index = Math.ceil(0.95 * durationsMs.length) - 1;
    const p95 = durationsMs[p95Index];

    expect(p95).toBeLessThan(500);
  });
});
