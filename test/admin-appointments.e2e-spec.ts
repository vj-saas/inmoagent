import { randomBytes } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  AppointmentStatus,
  ConversationState,
  PersonRole,
  type Lead,
  type Person,
  type Tenant,
} from '@prisma/client';
import * as argon2 from 'argon2';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { MessagingService } from '../src/messaging/messaging.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { AppointmentsService } from '../src/appointments/appointments.service';
import {
  LLM_PROVIDER,
  type LlmProvider,
} from '../src/llm/llm-provider.interface';

/**
 * E2E de B.1 (appointments admin): matriz de transiciones válidas/inválidas
 * (AC-1 a AC-15), filtros del GET (AC-16 a AC-18), validación de body (AC-2,
 * AC-8), assignedUserId inválido (AC-5) y un caso 404 por endpoint (AC-19
 * parcial). La regresión cross-tenant 403 exhaustiva es T10, las métricas T11.
 */
describe('Admin: appointments B.1 (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  const suffix = randomBytes(4).toString('hex');
  const apiKey = `test-b1-api-key-${suffix}`;
  let tenant: Tenant;
  let person: Person;
  let lead: Lead;

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
        name: 'B1 Test Tenant',
        slug: `b1-test-${suffix}`,
        phoneNumberId: `b1-test-phone-${suffix}`,
        accessTokenEnc: 'irrelevante',
        apiKeyHash: await argon2.hash(apiKey),
      },
    });

    person = await prisma.person.create({
      data: {
        tenantId: tenant.id,
        email: `agente-b1-${suffix}@test.com`,
        passwordHash: 'irrelevante',
        role: PersonRole.AGENT,
      },
    });

    lead = await prisma.lead.create({
      data: {
        tenantId: tenant.id,
        phone: `5491100${randomBytes(4).toString('hex')}`,
        state: ConversationState.QUALIFICATION,
      },
    });
  });

  afterAll(async () => {
    await prisma.tenant
      .delete({ where: { id: tenant.id } })
      .catch(() => undefined);
    await app.close();
  });

  async function createAppointment(
    overrides: Partial<{
      status: AppointmentStatus;
      scheduledAt: Date | null;
      assignedUserId: string | null;
    }> = {},
  ) {
    return prisma.appointment.create({
      data: {
        tenantId: tenant.id,
        leadId: lead.id,
        status: AppointmentStatus.PROPOSED,
        ...overrides,
      },
    });
  }

  const url = (aid: string, path: string) =>
    `/admin/tenants/${tenant.id}/appointments/${aid}/${path}`;

  const futureDate = '2026-09-15T14:00:00.000Z';

  // ── confirm (AC-1..AC-5) ────────────────────────────────────────────────

  describe('confirm', () => {
    it('AC-1: PROPOSED → CONFIRMED, fija scheduledAt', async () => {
      const appt = await createAppointment();
      const res = await request(app.getHttpServer())
        .post(url(appt.id, 'confirm'))
        .set('X-Api-Key', apiKey)
        .send({ scheduledAt: futureDate })
        .expect(200);
      const body = res.body as { status: string; scheduledAt: string };
      expect(body.status).toBe(AppointmentStatus.CONFIRMED);
      expect(new Date(body.scheduledAt).toISOString()).toBe(futureDate);
    });

    it('AC-2: sin scheduledAt → 400, sin modificar la cita', async () => {
      const appt = await createAppointment();
      await request(app.getHttpServer())
        .post(url(appt.id, 'confirm'))
        .set('X-Api-Key', apiKey)
        .send({})
        .expect(400);
      const unchanged = await prisma.appointment.findUniqueOrThrow({
        where: { id: appt.id },
      });
      expect(unchanged.status).toBe(AppointmentStatus.PROPOSED);
    });

    it('AC-3: confirm sobre cita no-PROPOSED → 409', async () => {
      const appt = await createAppointment({
        status: AppointmentStatus.CONFIRMED,
        scheduledAt: new Date(futureDate),
      });
      await request(app.getHttpServer())
        .post(url(appt.id, 'confirm'))
        .set('X-Api-Key', apiKey)
        .send({ scheduledAt: futureDate })
        .expect(409);
    });

    it('AC-4: confirm con assignedUserId válido lo asocia', async () => {
      const appt = await createAppointment();
      const res = await request(app.getHttpServer())
        .post(url(appt.id, 'confirm'))
        .set('X-Api-Key', apiKey)
        .send({ scheduledAt: futureDate, assignedUserId: person.id })
        .expect(200);
      const body = res.body as { assignedUserId: string | null };
      expect(body.assignedUserId).toBe(person.id);
    });

    it('AC-5: assignedUserId inexistente → 400, sin modificar la cita', async () => {
      const appt = await createAppointment();
      await request(app.getHttpServer())
        .post(url(appt.id, 'confirm'))
        .set('X-Api-Key', apiKey)
        .send({ scheduledAt: futureDate, assignedUserId: 'no-existe' })
        .expect(400);
      const unchanged = await prisma.appointment.findUniqueOrThrow({
        where: { id: appt.id },
      });
      expect(unchanged.status).toBe(AppointmentStatus.PROPOSED);
    });

    it('AC-5b: assignedUserId de otro tenant → 400', async () => {
      const otherTenant = await prisma.tenant.create({
        data: {
          name: 'Otro B1',
          slug: `otro-b1-${randomBytes(4).toString('hex')}`,
          phoneNumberId: `otro-b1-phone-${randomBytes(4).toString('hex')}`,
          accessTokenEnc: 'irrelevante',
          apiKeyHash: await argon2.hash('x'),
        },
      });
      const foreignPerson = await prisma.person.create({
        data: {
          tenantId: otherTenant.id,
          email: `foreign-b1-${randomBytes(4).toString('hex')}@test.com`,
          passwordHash: 'x',
          role: PersonRole.AGENT,
        },
      });
      const appt = await createAppointment();
      try {
        await request(app.getHttpServer())
          .post(url(appt.id, 'confirm'))
          .set('X-Api-Key', apiKey)
          .send({ scheduledAt: futureDate, assignedUserId: foreignPerson.id })
          .expect(400);
      } finally {
        await prisma.tenant
          .delete({ where: { id: otherTenant.id } })
          .catch(() => undefined);
      }
    });

    it('404: confirm sobre cita inexistente', async () => {
      await request(app.getHttpServer())
        .post(url('no-existe', 'confirm'))
        .set('X-Api-Key', apiKey)
        .send({ scheduledAt: futureDate })
        .expect(404);
    });
  });

  // ── reschedule (AC-6..AC-8) ─────────────────────────────────────────────

  describe('reschedule', () => {
    it('AC-6: CONFIRMED → actualiza scheduledAt sin cambiar status', async () => {
      const appt = await createAppointment({
        status: AppointmentStatus.CONFIRMED,
        scheduledAt: new Date(futureDate),
      });
      const nuevo = '2026-10-20T10:30:00.000Z';
      const res = await request(app.getHttpServer())
        .post(url(appt.id, 'reschedule'))
        .set('X-Api-Key', apiKey)
        .send({ scheduledAt: nuevo })
        .expect(200);
      const body = res.body as { status: string; scheduledAt: string };
      expect(body.status).toBe(AppointmentStatus.CONFIRMED);
      expect(new Date(body.scheduledAt).toISOString()).toBe(nuevo);
    });

    it('AC-7: reschedule sobre cita no-CONFIRMED → 409', async () => {
      const appt = await createAppointment();
      await request(app.getHttpServer())
        .post(url(appt.id, 'reschedule'))
        .set('X-Api-Key', apiKey)
        .send({ scheduledAt: futureDate })
        .expect(409);
    });

    it('AC-8: reschedule sin scheduledAt → 400', async () => {
      const appt = await createAppointment({
        status: AppointmentStatus.CONFIRMED,
        scheduledAt: new Date(futureDate),
      });
      await request(app.getHttpServer())
        .post(url(appt.id, 'reschedule'))
        .set('X-Api-Key', apiKey)
        .send({})
        .expect(400);
    });

    it('404: reschedule sobre cita inexistente', async () => {
      await request(app.getHttpServer())
        .post(url('no-existe', 'reschedule'))
        .set('X-Api-Key', apiKey)
        .send({ scheduledAt: futureDate })
        .expect(404);
    });
  });

  // ── cancel (AC-9, AC-10) ────────────────────────────────────────────────

  describe('cancel', () => {
    it('AC-9: cancel desde PROPOSED → CANCELLED', async () => {
      const appt = await createAppointment();
      const res = await request(app.getHttpServer())
        .post(url(appt.id, 'cancel'))
        .set('X-Api-Key', apiKey)
        .send({})
        .expect(200);
      expect((res.body as { status: string }).status).toBe(
        AppointmentStatus.CANCELLED,
      );
    });

    it('AC-9b: cancel desde CONFIRMED → CANCELLED', async () => {
      const appt = await createAppointment({
        status: AppointmentStatus.CONFIRMED,
        scheduledAt: new Date(futureDate),
      });
      const res = await request(app.getHttpServer())
        .post(url(appt.id, 'cancel'))
        .set('X-Api-Key', apiKey)
        .send({ notes: 'lead canceló' })
        .expect(200);
      const body = res.body as { status: string; notes: string | null };
      expect(body.status).toBe(AppointmentStatus.CANCELLED);
      expect(body.notes).toBe('lead canceló');
    });

    it('AC-10: cancel sobre estado terminal → 409', async () => {
      const appt = await createAppointment({
        status: AppointmentStatus.DONE,
        scheduledAt: new Date(futureDate),
      });
      await request(app.getHttpServer())
        .post(url(appt.id, 'cancel'))
        .set('X-Api-Key', apiKey)
        .send({})
        .expect(409);
    });

    it('404: cancel sobre cita inexistente', async () => {
      await request(app.getHttpServer())
        .post(url('no-existe', 'cancel'))
        .set('X-Api-Key', apiKey)
        .send({})
        .expect(404);
    });
  });

  // ── done (AC-11, AC-12) ─────────────────────────────────────────────────

  describe('done', () => {
    it('AC-11: done desde CONFIRMED → DONE, persiste outcome/notes', async () => {
      const appt = await createAppointment({
        status: AppointmentStatus.CONFIRMED,
        scheduledAt: new Date(futureDate),
      });
      const res = await request(app.getHttpServer())
        .post(url(appt.id, 'done'))
        .set('X-Api-Key', apiKey)
        .send({ outcome: 'visitó, le gustó', notes: 'sigue interesado' })
        .expect(200);
      const body = res.body as {
        status: string;
        outcome: string | null;
        notes: string | null;
      };
      expect(body.status).toBe(AppointmentStatus.DONE);
      expect(body.outcome).toBe('visitó, le gustó');
      expect(body.notes).toBe('sigue interesado');
    });

    it('AC-12: done sobre cita no-CONFIRMED → 409', async () => {
      const appt = await createAppointment();
      await request(app.getHttpServer())
        .post(url(appt.id, 'done'))
        .set('X-Api-Key', apiKey)
        .send({})
        .expect(409);
    });

    it('404: done sobre cita inexistente', async () => {
      await request(app.getHttpServer())
        .post(url('no-existe', 'done'))
        .set('X-Api-Key', apiKey)
        .send({})
        .expect(404);
    });
  });

  // ── no-show (AC-13, AC-14) ──────────────────────────────────────────────

  describe('no-show', () => {
    it('AC-13: no-show desde CONFIRMED → NO_SHOW, persiste outcome', async () => {
      const appt = await createAppointment({
        status: AppointmentStatus.CONFIRMED,
        scheduledAt: new Date(futureDate),
      });
      const res = await request(app.getHttpServer())
        .post(url(appt.id, 'no-show'))
        .set('X-Api-Key', apiKey)
        .send({ outcome: 'no vino' })
        .expect(200);
      const body = res.body as { status: string; outcome: string | null };
      expect(body.status).toBe(AppointmentStatus.NO_SHOW);
      expect(body.outcome).toBe('no vino');
    });

    it('AC-14: no-show sobre cita no-CONFIRMED → 409', async () => {
      const appt = await createAppointment();
      await request(app.getHttpServer())
        .post(url(appt.id, 'no-show'))
        .set('X-Api-Key', apiKey)
        .send({})
        .expect(409);
    });

    it('404: no-show sobre cita inexistente', async () => {
      await request(app.getHttpServer())
        .post(url('no-existe', 'no-show'))
        .set('X-Api-Key', apiKey)
        .send({})
        .expect(404);
    });
  });

  // ── AC-15: estados terminales rechazan las 5 acciones ───────────────────

  describe('AC-15: estados terminales bloqueados para las 5 acciones', () => {
    const terminals = [
      AppointmentStatus.DONE,
      AppointmentStatus.CANCELLED,
      AppointmentStatus.NO_SHOW,
    ];
    const actions: Array<{ path: string; body: object }> = [
      { path: 'confirm', body: { scheduledAt: futureDate } },
      { path: 'reschedule', body: { scheduledAt: futureDate } },
      { path: 'cancel', body: {} },
      { path: 'done', body: {} },
      { path: 'no-show', body: {} },
    ];

    for (const status of terminals) {
      for (const action of actions) {
        it(`${status} + ${action.path} → 409 sin modificar`, async () => {
          const appt = await createAppointment({
            status,
            scheduledAt: new Date(futureDate),
          });
          await request(app.getHttpServer())
            .post(url(appt.id, action.path))
            .set('X-Api-Key', apiKey)
            .send(action.body)
            .expect(409);
          const unchanged = await prisma.appointment.findUniqueOrThrow({
            where: { id: appt.id },
          });
          expect(unchanged.status).toBe(status);
        });
      }
    }
  });

  describe('carrera concurrente: la cita cambia de estado entre el find y el update', () => {
    it('confirm sobre una cita que pasó a CANCELLED justo antes → 409, no 200 con el estado ajeno', async () => {
      const appt = await createAppointment();
      // Simula que otra request canceló la cita en la ventana entre el
      // findAppointmentOrThrow inicial del endpoint y su updateMany: el
      // updateMany condicionado a status=PROPOSED ya no matchea ninguna fila,
      // así que debe rechazarse con 409 en vez de releer y devolver 200 con
      // el estado CANCELLED como si fuera el resultado de "confirm".
      await prisma.appointment.update({
        where: { id: appt.id },
        data: { status: AppointmentStatus.CANCELLED },
      });

      const res = await request(app.getHttpServer())
        .post(url(appt.id, 'confirm'))
        .set('X-Api-Key', apiKey)
        .send({ scheduledAt: futureDate })
        .expect(409);

      expect(res.body.message).toBeDefined();

      const unchanged = await prisma.appointment.findUniqueOrThrow({
        where: { id: appt.id },
      });
      expect(unchanged.status).toBe(AppointmentStatus.CANCELLED);
      expect(unchanged.scheduledAt).toBeNull();
    });

    it('done sobre una cita que pasó a NO_SHOW justo antes → 409, no 200 con outcome pisado', async () => {
      const appt = await createAppointment({
        status: AppointmentStatus.CONFIRMED,
        scheduledAt: new Date(futureDate),
      });
      await prisma.appointment.update({
        where: { id: appt.id },
        data: { status: AppointmentStatus.NO_SHOW, outcome: 'no vino' },
      });

      await request(app.getHttpServer())
        .post(url(appt.id, 'done'))
        .set('X-Api-Key', apiKey)
        .send({ outcome: 'visita ok' })
        .expect(409);

      const unchanged = await prisma.appointment.findUniqueOrThrow({
        where: { id: appt.id },
      });
      expect(unchanged.status).toBe(AppointmentStatus.NO_SHOW);
      expect(unchanged.outcome).toBe('no vino');
    });
  });

  // ── GET list (AC-16..AC-18) ─────────────────────────────────────────────

  describe('GET list', () => {
    let filterTenant: Tenant;
    let filterLead: Lead;
    const filterApiKey = `test-b1-filter-${randomBytes(4).toString('hex')}`;

    beforeAll(async () => {
      // Tenant aislado para que los filtros vean solo estas citas.
      filterTenant = await prisma.tenant.create({
        data: {
          name: 'B1 Filter Tenant',
          slug: `b1-filter-${randomBytes(4).toString('hex')}`,
          phoneNumberId: `b1-filter-phone-${randomBytes(4).toString('hex')}`,
          accessTokenEnc: 'irrelevante',
          apiKeyHash: await argon2.hash(filterApiKey),
        },
      });
      filterLead = await prisma.lead.create({
        data: {
          tenantId: filterTenant.id,
          phone: `5491100${randomBytes(4).toString('hex')}`,
        },
      });
      // 1 PROPOSED sin scheduledAt, 1 CONFIRMED en enero, 1 CONFIRMED en marzo.
      await prisma.appointment.createMany({
        data: [
          {
            tenantId: filterTenant.id,
            leadId: filterLead.id,
            status: AppointmentStatus.PROPOSED,
          },
          {
            tenantId: filterTenant.id,
            leadId: filterLead.id,
            status: AppointmentStatus.CONFIRMED,
            scheduledAt: new Date('2026-01-15T10:00:00.000Z'),
          },
          {
            tenantId: filterTenant.id,
            leadId: filterLead.id,
            status: AppointmentStatus.CONFIRMED,
            scheduledAt: new Date('2026-03-15T10:00:00.000Z'),
          },
        ],
      });
    });

    afterAll(async () => {
      await prisma.tenant
        .delete({ where: { id: filterTenant.id } })
        .catch(() => undefined);
    });

    const listUrl = () => `/admin/tenants/${filterTenant.id}/appointments`;

    it('AC-16: sin filtros devuelve todas las citas del tenant', async () => {
      const res = await request(app.getHttpServer())
        .get(listUrl())
        .set('X-Api-Key', filterApiKey)
        .expect(200);
      const body = res.body as { appointments: unknown[] };
      expect(body.appointments).toHaveLength(3);
    });

    it('AC-17: rango de fechas devuelve solo las que caen dentro (PROPOSED sin scheduledAt queda fuera)', async () => {
      const res = await request(app.getHttpServer())
        .get(listUrl())
        .query({ from: '2026-01-01T00:00:00.000Z', to: '2026-02-01T00:00:00.000Z' })
        .set('X-Api-Key', filterApiKey)
        .expect(200);
      const body = res.body as {
        appointments: Array<{ scheduledAt: string | null; status: string }>;
      };
      expect(body.appointments).toHaveLength(1);
      expect(new Date(body.appointments[0].scheduledAt as string).toISOString()).toBe(
        '2026-01-15T10:00:00.000Z',
      );
    });

    it('AC-18: filtro por status devuelve solo las de ese estado', async () => {
      const res = await request(app.getHttpServer())
        .get(listUrl())
        .query({ status: AppointmentStatus.PROPOSED })
        .set('X-Api-Key', filterApiKey)
        .expect(200);
      const body = res.body as { appointments: Array<{ status: string }> };
      expect(body.appointments).toHaveLength(1);
      expect(body.appointments[0].status).toBe(AppointmentStatus.PROPOSED);
    });

    it('AC-18b: filtro por múltiples status', async () => {
      const res = await request(app.getHttpServer())
        .get(listUrl())
        .query({ status: [AppointmentStatus.PROPOSED, AppointmentStatus.CONFIRMED] })
        .set('X-Api-Key', filterApiKey)
        .expect(200);
      const body = res.body as { appointments: unknown[] };
      expect(body.appointments).toHaveLength(3);
    });
  });

  // ── AC-21: métricas regression ──────────────────────────────────────────

  describe('metrics regression (AC-21)', () => {
    it('confirmar una cita dentro de un rango la refleja en appointments.confirmed', async () => {
      // La métrica filtra por `updatedAt` (momento del confirm), no por
      // `scheduledAt`: el rango debe cubrir "ahora", no la fecha futura de la
      // visita.
      const rangeStart = new Date(Date.now() - 60_000);
      const rangeEnd = new Date(Date.now() + 60_000);
      const from = rangeStart.toISOString();
      const to = rangeEnd.toISOString();
      const scheduledAt = '2027-05-15T14:00:00.000Z';

      const before = await request(app.getHttpServer())
        .get(`/admin/tenants/${tenant.id}/metrics`)
        .query({ from, to })
        .set('X-Api-Key', apiKey)
        .expect(200);
      const beforeConfirmed = (
        before.body as { appointments: { confirmed: number } }
      ).appointments.confirmed;

      const appt = await createAppointment();
      await request(app.getHttpServer())
        .post(url(appt.id, 'confirm'))
        .set('X-Api-Key', apiKey)
        .send({ scheduledAt })
        .expect(200);

      const after = await request(app.getHttpServer())
        .get(`/admin/tenants/${tenant.id}/metrics`)
        .query({ from, to })
        .set('X-Api-Key', apiKey)
        .expect(200);
      const afterConfirmed = (
        after.body as { appointments: { confirmed: number } }
      ).appointments.confirmed;

      expect(afterConfirmed).toBe(beforeConfirmed + 1);
    });
  });

  // ── AC-22: regresión de AppointmentsService.propose() ───────────────────

  describe('propose() regression (AC-22)', () => {
    it('sigue creando la cita en PROPOSED, sin scheduledAt', async () => {
      const appointmentsService = app.get(AppointmentsService);
      const created = await appointmentsService.propose(
        tenant.id,
        lead.id,
        null,
      );
      expect(created.status).toBe(AppointmentStatus.PROPOSED);
      expect(created.scheduledAt).toBeNull();
    });
  });
});
