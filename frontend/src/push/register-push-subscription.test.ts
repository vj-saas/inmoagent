import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerPushSubscriptionOnce } from './register-push-subscription';
import * as endpoints from '../api/endpoints';

(globalThis as any).__TESTING_PUSH__ = true;

/**
 * Spec B.4 — UI de alta de suscripción (AC-1 lado frontend, AC-2).
 *
 * Contrato asumido, a crear en
 * `frontend/src/push/register-push-subscription.ts`:
 * `registerPushSubscriptionOnce(token: string, tenantId: string): Promise<void>`
 * — pide permiso de notificación (si `Notification.permission` es `default`),
 * y si queda `granted`, registra la suscripción del `ServiceWorkerRegistration`
 * contra `endpoints.createPushSubscription`. Si el permiso es `denied` (ya
 * rechazado antes) o el navegador no soporta `Notification`/`serviceWorker`,
 * no hace nada y NO lanza (el panel debe seguir funcionando con normalidad).
 */
describe('registerPushSubscriptionOnce', () => {
  let originalNotification: typeof Notification | undefined;

  beforeEach(() => {
    originalNotification = (globalThis as { Notification?: typeof Notification })
      .Notification;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    (globalThis as { Notification?: typeof Notification }).Notification =
      originalNotification as typeof Notification;
  });

  function mockNotification(permission: NotificationPermission, requestResult?: NotificationPermission) {
    const NotificationMock = {
      permission,
      requestPermission: vi.fn().mockResolvedValue(requestResult ?? permission),
    };
    (globalThis as unknown as { Notification: unknown }).Notification =
      NotificationMock;
    return NotificationMock;
  }

  function mockServiceWorkerWithSubscription(subscription: unknown) {
    const pushManager = {
      getSubscription: vi.fn().mockResolvedValue(null),
      subscribe: vi.fn().mockResolvedValue(subscription),
    };
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        ready: Promise.resolve({ pushManager }),
      },
    });
    return pushManager;
  }

  // AC-1 (lado frontend): permiso concedido → registra la suscripción contra el backend.
  it('AC-1: si el permiso se concede, registra la suscripción contra el backend', async () => {
    mockNotification('default', 'granted');
    const subscriptionJSON = {
      endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
      keys: { p256dh: 'p256dh-key', auth: 'auth-secret' },
    };
    mockServiceWorkerWithSubscription({
      toJSON: () => subscriptionJSON,
    });
    const createSpy = vi
      .spyOn(endpoints, 'createPushSubscription')
      .mockResolvedValue({ id: 'sub-1' });

    await registerPushSubscriptionOnce('token-1', 'tenant-1');

    expect(createSpy).toHaveBeenCalledWith(
      'tenant-1',
      expect.objectContaining({
        endpoint: subscriptionJSON.endpoint,
        p256dh: subscriptionJSON.keys.p256dh,
        auth: subscriptionJSON.keys.auth,
      }),
      'token-1',
    );
  });

  // AC-2: permiso ya rechazado → no bloquea ni insiste, no llama al backend.
  it('AC-2: si el permiso ya fue rechazado, no registra nada y no lanza', async () => {
    mockNotification('denied');
    mockServiceWorkerWithSubscription({ toJSON: () => ({}) });
    const createSpy = vi
      .spyOn(endpoints, 'createPushSubscription')
      .mockResolvedValue({ id: 'sub-1' });

    await expect(
      registerPushSubscriptionOnce('token-1', 'tenant-1'),
    ).resolves.toBeUndefined();

    expect(createSpy).not.toHaveBeenCalled();
  });

  // AC-2: navegador sin soporte de Notification → no bloquea el panel.
  it('AC-2: sin soporte de Notification en el navegador, no lanza y no bloquea el panel', async () => {
    delete (globalThis as { Notification?: unknown }).Notification;
    const createSpy = vi
      .spyOn(endpoints, 'createPushSubscription')
      .mockResolvedValue({ id: 'sub-1' });

    await expect(
      registerPushSubscriptionOnce('token-1', 'tenant-1'),
    ).resolves.toBeUndefined();

    expect(createSpy).not.toHaveBeenCalled();
  });
});
