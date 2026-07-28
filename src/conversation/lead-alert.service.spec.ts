import type { Lead, Tenant } from '@prisma/client';
import { LeadAlertService } from './lead-alert.service';
import type { MessagingService } from '../messaging/messaging.service';

/**
 * AC-18 (spec 09, T1.1): la alerta interna usa el nombre del lead cuando ya
 * lo tenemos, y sigue cayendo a 'Sin nombre' cuando no (regresión).
 */
describe('LeadAlertService — nombre en la alerta (AC-18)', () => {
  const tenant = {
    id: 'tenant-1',
    alertsEnabled: true,
    alertPhone: '5491100000001',
  } as Tenant;

  function lead(overrides: Partial<Lead> = {}): Lead {
    return {
      id: 'lead-1',
      phone: '5491100000000',
      name: null,
      fOperation: null,
      fNeighborhoods: [],
      fMaxPrice: null,
      fCurrency: null,
      fMinRooms: null,
      ...overrides,
    } as unknown as Lead;
  }

  function buildService() {
    const messaging = {
      sendTemplate: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<MessagingService>;
    return { service: new LeadAlertService(messaging), messaging };
  }

  it('AC-18: con Lead.name seteado, la alerta usa ese nombre', async () => {
    const { service, messaging } = buildService();

    await service.notify(tenant, lead({ name: 'Martín' }), null);

    expect(messaging.sendTemplate).toHaveBeenCalledWith(
      tenant,
      tenant.alertPhone,
      'lead_alert',
      ['Martín', '5491100000000', expect.any(String), 'Sin propiedad puntual'],
    );
  });

  it('sin Lead.name, sigue cayendo a "Sin nombre" (regresión)', async () => {
    const { service, messaging } = buildService();

    await service.notify(tenant, lead({ name: null }), null);

    expect(messaging.sendTemplate).toHaveBeenCalledWith(
      tenant,
      tenant.alertPhone,
      'lead_alert',
      [
        'Sin nombre',
        '5491100000000',
        expect.any(String),
        'Sin propiedad puntual',
      ],
    );
  });
});
