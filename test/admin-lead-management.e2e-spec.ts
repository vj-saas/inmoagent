import { randomBytes } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  ConversationState,
  PersonRole,
  type Person,
  type Tenant,
} from '@prisma/client';
import * as argon2 from 'argon2';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { MessagingService } from '../src/messaging/messaging.service';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  LLM_PROVIDER,
  type LlmProvider,
} from '../src/llm/llm-provider.interface';

/**
 * E2E de A.4 (ficha del lead): notas, contactado, opt-out, assignment y la
 * verificación de que `GET :leadId` expone los tres campos nuevos.
 * Cubre AC-5, AC-6, AC-8, AC-9, AC-10, AC-12, AC-13, AC-14, AC-16, AC-17,
 * AC-20, más un caso 404 por endpoint (la matriz cross-tenant exhaustiva es T8).
 */
describe('Admin: gestión de leads A.4 (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  const suffix = randomBytes(4).toString('hex');
  const apiKey = `test-a4-api-key-${suffix}`;
  let tenant: Tenant;
  let person: Person;

  beforeAll(async () => {
    const llm: jest.Mocked<LlmProvider> = {
      extractIntent: jest.fn(),
      composeReply: jest.fn(),
    };
    const messaging = {
      sendText: jest.fn().mockResolvedValue(undefined),
      sendImage: jest.fn().mockResolvedValue(undefined),
      sendTemplate: jest.fn().mockResolvedValue(undefined),
      markAsRead: jest.fn().mockResolvedValue(undefined),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(LLM_PROVIDER)
      .useValue(llm)
      .overrideProvider(MessagingService)
      .useValue(messaging)
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    prisma = app.get(PrismaService);

    tenant = await prisma.tenant.create({
      data: {
        name: 'A4 Test Tenant',
        slug: `a4-test-${suffix}`,
        phoneNumberId: `a4-test-phone-${suffix}`,
        accessTokenEnc: 'irrelevante',
        apiKeyHash: await argon2.hash(apiKey),
      },
    });

    person = await prisma.person.create({
      data: {
        tenantId: tenant.id,
        email: `agente-${suffix}@test.com`,
        passwordHash: 'irrelevante',
        role: PersonRole.AGENT,
      },
    });
  });

  afterAll(async () => {
    await prisma.tenant
      .delete({ where: { id: tenant.id } })
      .catch(() => undefined);
    await app.close();
  });

  async function createLead(
    overrides: Partial<{
      state: ConversationState;
      contactedAt: Date | null;
      assignedUserId: string | null;
      optedOutAt: Date | null;
    }> = {},
  ) {
    return prisma.lead.create({
      data: {
        tenantId: tenant.id,
        phone: `5491100${randomBytes(4).toString('hex')}`,
        ...overrides,
      },
    });
  }

  const url = (leadId: string, path: string) =>
    `/admin/tenants/${tenant.id}/leads/${leadId}/${path}`;

  // ── Notas (AC-5, AC-6, AC-8) ────────────────────────────────────────────

  describe('Notas', () => {
    it('AC-5: POST notes con texto crea la nota y la devuelve (201)', async () => {
      const lead = await createLead();
      const res = await request(app.getHttpServer())
        .post(url(lead.id, 'notes'))
        .set('X-Api-Key', apiKey)
        .send({ body: '  Habló por teléfono, muy interesado  ' })
        .expect(201);

      const note = res.body as {
        id: string;
        leadId: string;
        tenantId: string;
        body: string;
        author: unknown;
      };
      expect(note.leadId).toBe(lead.id);
      expect(note.tenantId).toBe(tenant.id);
      expect(note.body).toBe('Habló por teléfono, muy interesado'); // trimmeado
      expect(note.author).toBeNull(); // API key: sin persona de sesión
    });

    it('AC-6: POST notes con texto vacío → 400, sin crear nota', async () => {
      const lead = await createLead();
      await request(app.getHttpServer())
        .post(url(lead.id, 'notes'))
        .set('X-Api-Key', apiKey)
        .send({ body: '' })
        .expect(400);
      await request(app.getHttpServer())
        .post(url(lead.id, 'notes'))
        .set('X-Api-Key', apiKey)
        .send({ body: '   ' })
        .expect(400);
      await request(app.getHttpServer())
        .post(url(lead.id, 'notes'))
        .set('X-Api-Key', apiKey)
        .send({})
        .expect(400);
      expect(
        await prisma.leadNote.count({ where: { leadId: lead.id } }),
      ).toBe(0);
    });

    it('AC-8: GET notes devuelve las notas ordenadas por fecha descendente', async () => {
      const lead = await createLead();
      await prisma.leadNote.create({
        data: {
          tenantId: tenant.id,
          leadId: lead.id,
          body: 'primera',
          createdAt: new Date('2026-01-01T10:00:00Z'),
        },
      });
      await prisma.leadNote.create({
        data: {
          tenantId: tenant.id,
          leadId: lead.id,
          body: 'segunda',
          createdAt: new Date('2026-01-02T10:00:00Z'),
        },
      });

      const res = await request(app.getHttpServer())
        .get(url(lead.id, 'notes'))
        .set('X-Api-Key', apiKey)
        .expect(200);

      const body = res.body as { notes: Array<{ body: string }> };
      expect(body.notes.map((n) => n.body)).toEqual(['segunda', 'primera']);
    });

    it('404: POST/GET notes sobre lead inexistente', async () => {
      await request(app.getHttpServer())
        .post(url('lead-inexistente', 'notes'))
        .set('X-Api-Key', apiKey)
        .send({ body: 'x' })
        .expect(404);
      await request(app.getHttpServer())
        .get(url('lead-inexistente', 'notes'))
        .set('X-Api-Key', apiKey)
        .expect(404);
    });
  });

  // ── Contactado (AC-9, AC-10) ────────────────────────────────────────────

  describe('Contactado', () => {
    it('AC-9: POST contacted setea contactedAt y devuelve el lead', async () => {
      const lead = await createLead();
      const res = await request(app.getHttpServer())
        .post(url(lead.id, 'contacted'))
        .set('X-Api-Key', apiKey)
        .expect(200);
      const body = res.body as { id: string; contactedAt: string | null };
      expect(body.id).toBe(lead.id);
      expect(body.contactedAt).not.toBeNull();
    });

    it('AC-10: POST uncontacted limpia contactedAt', async () => {
      const lead = await createLead({ contactedAt: new Date() });
      const res = await request(app.getHttpServer())
        .post(url(lead.id, 'uncontacted'))
        .set('X-Api-Key', apiKey)
        .expect(200);
      const body = res.body as { contactedAt: string | null };
      expect(body.contactedAt).toBeNull();
    });

    it('404: contacted/uncontacted sobre lead inexistente', async () => {
      await request(app.getHttpServer())
        .post(url('lead-inexistente', 'contacted'))
        .set('X-Api-Key', apiKey)
        .expect(404);
      await request(app.getHttpServer())
        .post(url('lead-inexistente', 'uncontacted'))
        .set('X-Api-Key', apiKey)
        .expect(404);
    });
  });

  // ── Opt-out (AC-16, AC-17) ──────────────────────────────────────────────

  describe('Opt-out', () => {
    it('AC-16: POST opt-out pasa a OPTED_OUT y setea optedOutAt', async () => {
      const lead = await createLead({ state: ConversationState.QUALIFICATION });
      const res = await request(app.getHttpServer())
        .post(url(lead.id, 'opt-out'))
        .set('X-Api-Key', apiKey)
        .expect(200);
      const body = res.body as { state: string; optedOutAt: string | null };
      expect(body.state).toBe(ConversationState.OPTED_OUT);
      expect(body.optedOutAt).not.toBeNull();
    });

    it('AC-17: opt-out es idempotente (no cambia optedOutAt existente)', async () => {
      const original = new Date('2026-03-01T12:00:00Z');
      const lead = await createLead({
        state: ConversationState.OPTED_OUT,
        optedOutAt: original,
      });
      const res = await request(app.getHttpServer())
        .post(url(lead.id, 'opt-out'))
        .set('X-Api-Key', apiKey)
        .expect(200);
      const body = res.body as { state: string; optedOutAt: string };
      expect(body.state).toBe(ConversationState.OPTED_OUT);
      expect(new Date(body.optedOutAt).toISOString()).toBe(
        original.toISOString(),
      );
    });

    it('404: opt-out sobre lead inexistente', async () => {
      await request(app.getHttpServer())
        .post(url('lead-inexistente', 'opt-out'))
        .set('X-Api-Key', apiKey)
        .expect(404);
    });
  });

  // ── Assignment (AC-12, AC-13, AC-14) ────────────────────────────────────

  describe('Assignment', () => {
    it('AC-12: PATCH assignment con assignedUserId válido lo asigna', async () => {
      const lead = await createLead();
      const res = await request(app.getHttpServer())
        .patch(url(lead.id, 'assignment'))
        .set('X-Api-Key', apiKey)
        .send({ assignedUserId: person.id })
        .expect(200);
      const body = res.body as { assignedUserId: string | null };
      expect(body.assignedUserId).toBe(person.id);
    });

    it('AC-13: assignedUserId de otro tenant → 400, sin modificar el lead', async () => {
      const otherTenant = await prisma.tenant.create({
        data: {
          name: 'Otro A4',
          slug: `otro-a4-${randomBytes(4).toString('hex')}`,
          phoneNumberId: `otro-a4-phone-${randomBytes(4).toString('hex')}`,
          accessTokenEnc: 'irrelevante',
          apiKeyHash: await argon2.hash('x'),
        },
      });
      const foreignPerson = await prisma.person.create({
        data: {
          tenantId: otherTenant.id,
          email: `foreign-${randomBytes(4).toString('hex')}@test.com`,
          passwordHash: 'x',
          role: PersonRole.AGENT,
        },
      });
      const lead = await createLead({ assignedUserId: person.id });

      try {
        await request(app.getHttpServer())
          .patch(url(lead.id, 'assignment'))
          .set('X-Api-Key', apiKey)
          .send({ assignedUserId: foreignPerson.id })
          .expect(400);
        const unchanged = await prisma.lead.findUniqueOrThrow({
          where: { id: lead.id },
        });
        expect(unchanged.assignedUserId).toBe(person.id); // no mutó
      } finally {
        await prisma.tenant
          .delete({ where: { id: otherTenant.id } })
          .catch(() => undefined);
      }
    });

    it('AC-14: PATCH assignment con nextActionAt lo setea', async () => {
      const lead = await createLead();
      const when = '2026-08-01T15:30:00.000Z';
      const res = await request(app.getHttpServer())
        .patch(url(lead.id, 'assignment'))
        .set('X-Api-Key', apiKey)
        .send({ nextActionAt: when })
        .expect(200);
      const body = res.body as { nextActionAt: string | null };
      expect(new Date(body.nextActionAt as string).toISOString()).toBe(when);
    });

    it('solo nextActionAt no borra assignedUserId (semántica parcial)', async () => {
      const lead = await createLead({ assignedUserId: person.id });
      const res = await request(app.getHttpServer())
        .patch(url(lead.id, 'assignment'))
        .set('X-Api-Key', apiKey)
        .send({ nextActionAt: '2026-09-01T10:00:00.000Z' })
        .expect(200);
      const body = res.body as { assignedUserId: string | null };
      expect(body.assignedUserId).toBe(person.id); // sigue asignado
    });

    it('assignedUserId: null desasigna explícitamente', async () => {
      const lead = await createLead({ assignedUserId: person.id });
      const res = await request(app.getHttpServer())
        .patch(url(lead.id, 'assignment'))
        .set('X-Api-Key', apiKey)
        .send({ assignedUserId: null })
        .expect(200);
      const body = res.body as { assignedUserId: string | null };
      expect(body.assignedUserId).toBeNull();
    });

    it('404: assignment sobre lead inexistente', async () => {
      await request(app.getHttpServer())
        .patch(url('lead-inexistente', 'assignment'))
        .set('X-Api-Key', apiKey)
        .send({ assignedUserId: person.id })
        .expect(404);
    });
  });

  // ── T8: lead de OTRO tenant → 404 indistinguible de inexistente (AC-21) ──
  //
  // Caso (b) de T8: el `:tenantId` de la URL es el del tenant autenticado,
  // pero el `leadId` pertenece a OTRO tenant. `findLeadOrThrow` filtra por
  // `{ id, tenantId }`, así que no matchea → 404, exactamente igual que un
  // leadId inexistente (caso (a), ya cubierto por endpoint arriba). Esto evita
  // el oráculo de existencia cross-tenant. Verificamos además que el lead ajeno
  // NO se modifica por el intento.
  describe('T8/AC-21: lead de otro tenant vía la URL del tenant propio → 404', () => {
    let otherTenantId: string;
    let foreignLeadId: string;

    beforeAll(async () => {
      const otherTenant = await prisma.tenant.create({
        data: {
          name: 'A4 Foreign Tenant',
          slug: `a4-foreign-${randomBytes(4).toString('hex')}`,
          phoneNumberId: `a4-foreign-phone-${randomBytes(4).toString('hex')}`,
          accessTokenEnc: 'irrelevante',
          apiKeyHash: await argon2.hash('x'),
        },
      });
      otherTenantId = otherTenant.id;
      const foreignLead = await prisma.lead.create({
        data: {
          tenantId: otherTenantId,
          phone: `5491199${randomBytes(4).toString('hex')}`,
          state: ConversationState.QUALIFICATION,
        },
      });
      foreignLeadId = foreignLead.id;
    });

    afterAll(async () => {
      await prisma.tenant
        .delete({ where: { id: otherTenantId } })
        .catch(() => undefined);
    });

    // La URL usa `tenant.id` (el autenticado) + el leadId ajeno; apiKey del
    // tenant propio. Cada endpoint nuevo debe dar 404, no exponer ni tocar B.
    it('POST notes → 404 y no crea nota en el lead ajeno', async () => {
      await request(app.getHttpServer())
        .post(url(foreignLeadId, 'notes'))
        .set('X-Api-Key', apiKey)
        .send({ body: 'intrusión' })
        .expect(404);
      expect(
        await prisma.leadNote.count({ where: { leadId: foreignLeadId } }),
      ).toBe(0);
    });

    it('GET notes → 404 sin exponer notas del lead ajeno', async () => {
      const res = await request(app.getHttpServer())
        .get(url(foreignLeadId, 'notes'))
        .set('X-Api-Key', apiKey)
        .expect(404);
      expect(JSON.stringify(res.body)).not.toContain(foreignLeadId);
    });

    it('POST contacted → 404 y no marca contactedAt en el lead ajeno', async () => {
      await request(app.getHttpServer())
        .post(url(foreignLeadId, 'contacted'))
        .set('X-Api-Key', apiKey)
        .expect(404);
      const unchanged = await prisma.lead.findUniqueOrThrow({
        where: { id: foreignLeadId },
      });
      expect(unchanged.contactedAt).toBeNull();
    });

    it('POST uncontacted → 404 (lead ajeno)', async () => {
      await request(app.getHttpServer())
        .post(url(foreignLeadId, 'uncontacted'))
        .set('X-Api-Key', apiKey)
        .expect(404);
    });

    it('POST opt-out → 404 y no cambia el estado del lead ajeno', async () => {
      await request(app.getHttpServer())
        .post(url(foreignLeadId, 'opt-out'))
        .set('X-Api-Key', apiKey)
        .expect(404);
      const unchanged = await prisma.lead.findUniqueOrThrow({
        where: { id: foreignLeadId },
      });
      expect(unchanged.state).toBe(ConversationState.QUALIFICATION);
      expect(unchanged.optedOutAt).toBeNull();
    });

    it('PATCH assignment → 404 y no asigna el lead ajeno', async () => {
      await request(app.getHttpServer())
        .patch(url(foreignLeadId, 'assignment'))
        .set('X-Api-Key', apiKey)
        .send({ assignedUserId: person.id })
        .expect(404);
      const unchanged = await prisma.lead.findUniqueOrThrow({
        where: { id: foreignLeadId },
      });
      expect(unchanged.assignedUserId).toBeNull();
    });
  });

  // ── getOne expone los tres campos nuevos (AC-20) ────────────────────────

  describe('GET :leadId (AC-20)', () => {
    it('incluye contactedAt, assignedUserId y nextActionAt', async () => {
      const lead = await createLead({
        contactedAt: new Date(),
        assignedUserId: person.id,
      });
      const res = await request(app.getHttpServer())
        .get(`/admin/tenants/${tenant.id}/leads/${lead.id}`)
        .set('X-Api-Key', apiKey)
        .expect(200);
      const body = res.body as Record<string, unknown>;
      expect(body).toHaveProperty('contactedAt');
      expect(body).toHaveProperty('assignedUserId', person.id);
      expect(body).toHaveProperty('nextActionAt');
    });
  });
});
