import { PushNotificationService } from './push-notification.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Contrato asumido para el servicio de envío de push (spec B.4, "servicio de
 * envío de push"), a crear por `planner`/`implementer` en
 * `src/push-notifications/push-notification.service.ts`:
 *
 *  - `notifyAppointmentProposed(tenantId, appointment)`: consulta TODAS las
 *    `PushSubscription` cuyo `tenantId` coincide y cuya `Person` tiene
 *    `active = true` (filtro en una sola query, AC-12), y envía un push a
 *    cada una vía `web-push` (`sendNotification`).
 *  - `notifyAppointmentAssigned(tenantId, personId, appointment)`: consulta
 *    solo las `PushSubscription` de esa `Person` puntual (`tenantId` +
 *    `personId`) y envía únicamente a esas.
 *  - Nunca lanza si `web-push` rechaza: loguea y sigue (AC-8).
 *  - Si el rechazo trae `statusCode: 410` (expirada/gone), borra esa
 *    `PushSubscription` de la base (AC-9), sin afectar el resto.
 *  - El payload enviado a cada suscripción es JSON con únicamente
 *    `title`/`body` (español) y los identificadores mínimos
 *    (`appointmentId`, `leadId`) — nunca datos adicionales del lead como
 *    teléfono completo o notas (AC-10).
 *
 * Se mockea el módulo `web-push` (dependencia nueva de esta spec) para no
 * pegarle a un proveedor real.
 */
jest.mock('web-push', () => ({
  sendNotification: jest.fn(),
  setVapidDetails: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const webpush = jest.requireMock('web-push') as {
  sendNotification: jest.Mock;
};

describe('PushNotificationService', () => {
  let prisma: {
    pushSubscription: {
      findMany: jest.Mock;
      delete: jest.Mock;
    };
  };
  let config: {
    get: jest.Mock;
  };

  const tenantId = 'tenant-1';
  const appointment = { id: 'appt-1', leadId: 'lead-1' };

  const sub = (overrides: Partial<Record<string, unknown>> = {}) => ({
    id: 'sub-1',
    tenantId,
    personId: 'person-1',
    endpoint: 'https://push.example.com/abc',
    p256dh: 'p256dh-key',
    auth: 'auth-secret',
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = {
      pushSubscription: {
        findMany: jest.fn(),
        delete: jest.fn(),
      },
    };
    config = {
      get: jest.fn((key: string) => {
        if (key === 'VAPID_PUBLIC_KEY') return 'pubkey';
        if (key === 'VAPID_PRIVATE_KEY') return 'privkey';
        if (key === 'VAPID_SUBJECT') return 'mailto:test@test.com';
        return null;
      }),
    };
    service = new PushNotificationService(
      prisma as unknown as PrismaService,
      config as any,
    );
  });

  // AC-6 (a nivel del servicio que usan los dos disparadores)
  it('AC-6: notifyAppointmentProposed consulta suscripciones filtradas por tenantId y persona activa, y envía a todas', async () => {
    prisma.pushSubscription.findMany.mockResolvedValue([
      sub({ id: 'sub-1', personId: 'person-1' }),
      sub({ id: 'sub-2', personId: 'person-2' }),
    ]);
    webpush.sendNotification.mockResolvedValue(undefined);

    await service.notifyAppointmentProposed(tenantId, appointment);

    const call = prisma.pushSubscription.findMany.mock.calls[0][0];
    expect(JSON.stringify(call)).toContain(tenantId);
    expect(webpush.sendNotification).toHaveBeenCalledTimes(2);
  });

  // AC-7
  it('AC-7: notifyAppointmentAssigned consulta y envía solo a las suscripciones de esa Person puntual', async () => {
    prisma.pushSubscription.findMany.mockResolvedValue([
      sub({ id: 'sub-1', personId: 'person-assigned' }),
    ]);
    webpush.sendNotification.mockResolvedValue(undefined);

    await service.notifyAppointmentAssigned(
      tenantId,
      'person-assigned',
      appointment,
    );

    const call = prisma.pushSubscription.findMany.mock.calls[0][0];
    const serialized = JSON.stringify(call);
    expect(serialized).toContain(tenantId);
    expect(serialized).toContain('person-assigned');
    expect(webpush.sendNotification).toHaveBeenCalledTimes(1);
  });

  // AC-8
  it('AC-8: un fallo de envío (error genérico) no revienta el método ni interrumpe el resto', async () => {
    prisma.pushSubscription.findMany.mockResolvedValue([
      sub({ id: 'sub-1' }),
      sub({ id: 'sub-2' }),
    ]);
    webpush.sendNotification
      .mockRejectedValueOnce(new Error('ECONNRESET'))
      .mockResolvedValueOnce(undefined);

    await expect(
      service.notifyAppointmentProposed(tenantId, appointment),
    ).resolves.not.toThrow();

    expect(webpush.sendNotification).toHaveBeenCalledTimes(2);
    // El fallo genérico no dispara limpieza de la suscripción.
    expect(prisma.pushSubscription.delete).not.toHaveBeenCalled();
  });

  // AC-9
  it('AC-9: una suscripción rechazada con 410 (gone) se elimina, sin afectar al resto', async () => {
    prisma.pushSubscription.findMany.mockResolvedValue([
      sub({ id: 'sub-expired' }),
      sub({ id: 'sub-valid' }),
    ]);
    const goneError = Object.assign(new Error('Gone'), { statusCode: 410 });
    webpush.sendNotification
      .mockRejectedValueOnce(goneError)
      .mockResolvedValueOnce(undefined);

    await service.notifyAppointmentProposed(tenantId, appointment);

    expect(prisma.pushSubscription.delete).toHaveBeenCalledTimes(1);
    expect(prisma.pushSubscription.delete).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'sub-expired' } }),
    );
  });

  // AC-10
  it('AC-10: el payload enviado no incluye datos del lead más allá del identificador mínimo', async () => {
    prisma.pushSubscription.findMany.mockResolvedValue([sub({ id: 'sub-1' })]);
    webpush.sendNotification.mockResolvedValue(undefined);

    await service.notifyAppointmentProposed(tenantId, {
      id: 'appt-1',
      leadId: 'lead-1',
    });

    const [, payloadArg] = webpush.sendNotification.mock.calls[0];
    const payload = JSON.parse(payloadArg as string) as Record<string, unknown>;

    expect(payload.appointmentId).toBe('appt-1');
    expect(payload.leadId).toBe('lead-1');
    expect(typeof payload.body).toBe('string');
    expect(payload).not.toHaveProperty('phone');
    expect(payload).not.toHaveProperty('notes');
    // Nada de dígitos largos tipo teléfono completo colado en el texto.
    expect(String(payload.body)).not.toMatch(/\d{8,}/);
  });
});
