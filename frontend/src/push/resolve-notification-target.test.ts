import { describe, expect, it } from 'vitest';
import { resolveNotificationTarget } from './resolve-notification-target';

/**
 * Spec B.4 (AC-11): al hacer click en una notificación push, el service
 * worker debe enfocar/abrir la vista relevante para esa notificación (ficha
 * del lead o agenda) según el `appointmentId`/`leadId` que viaja en el
 * payload. Esta función pura resuelve esa URL de destino; la usan tanto el
 * listener `notificationclick` del service worker (`public/sw.js` o
 * equivalente) como este test, sin depender del entorno de Service Worker.
 *
 * Contrato asumido, a crear en `frontend/src/push/resolve-notification-target.ts`:
 * `resolveNotificationTarget(data: { appointmentId?: string; leadId?: string }): string`.
 */
describe('resolveNotificationTarget (AC-11)', () => {
  it('con appointmentId apunta a la agenda de esa cita', () => {
    const url = resolveNotificationTarget({ appointmentId: 'appt-123' });
    expect(url).toContain('/agenda');
    expect(url).toContain('appt-123');
  });

  it('con leadId (sin appointmentId) apunta a la ficha del lead', () => {
    const url = resolveNotificationTarget({ leadId: 'lead-456' });
    expect(url).toBe('/leads/lead-456');
  });

  it('sin ningún identificador cae a una vista por defecto razonable', () => {
    const url = resolveNotificationTarget({});
    expect(url).toBe('/agenda');
  });
});
