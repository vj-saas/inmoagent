import { createPushSubscription } from '../api/endpoints';

/**
 * Convierte un ArrayBuffer a String en base64url compatible con VAPID.
 */
function arrayBufferToBase64Url(buffer: ArrayBuffer): string {
  const binary = String.fromCharCode(...new Uint8Array(buffer));
  const base64 = btoa(binary);
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Pide permiso para recibir notificaciones (si está en 'default') y registra la
 * suscripción Web Push contra el backend.
 */
export async function registerPushSubscriptionOnce(
  token: string,
  tenantId: string,
): Promise<void> {
  const isTest = typeof process !== 'undefined' && process.env.NODE_ENV === 'test';
  const isPushTest = typeof globalThis !== 'undefined' && (globalThis as any).__TESTING_PUSH__;
  if (isTest && !isPushTest) {
    return;
  }
  if (
    typeof globalThis === 'undefined' ||
    typeof window === 'undefined' ||
    !('Notification' in globalThis) ||
    typeof navigator === 'undefined' ||
    !('serviceWorker' in navigator) ||
    !navigator.serviceWorker ||
    !navigator.serviceWorker.ready
  ) {
    return;
  }

  if (Notification.permission === 'denied') {
    return;
  }

  try {
    let permission = Notification.permission;
    if (permission === 'default') {
      permission = await Notification.requestPermission();
    }

    if (permission !== 'granted') {
      return;
    }

    const registration = await navigator.serviceWorker.ready;
    if (!registration.pushManager) {
      return;
    }

    // Obtener la clave pública VAPID provista por el backend.
    // Usamos una clave por defecto para desarrollo, pero en prod debería venir del backend/config.
    // Dado que no hay un endpoint de config pública de VAPID, usamos la variable del entorno
    // inyectada por Vite o un placeholder compatible con VAPID.
    const vapidPublicKey = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_VAPID_PUBLIC_KEY) || 
      'BC0wKaYgi1MKBUougR_4Ev_-d56jO91nfgLkGnAOrlp3ffzrb8SN68eAV13NO5a3IY2QXjulmBlBWuf7npOVNh0';

    let subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      // Registrar nueva suscripción
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: vapidPublicKey,
      });
    }

    const json = subscription.toJSON();
    if (json.endpoint && json.keys?.p256dh && json.keys?.auth) {
      await createPushSubscription(
        tenantId,
        {
          endpoint: json.endpoint,
          p256dh: json.keys.p256dh,
          auth: json.keys.auth,
        },
        token,
      );
    }
  } catch (error) {
    console.error('Error al registrar suscripción Push:', error);
  }
}
