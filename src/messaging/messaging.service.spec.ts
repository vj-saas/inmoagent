import type { Tenant } from '@prisma/client';
import type { Queue } from 'bullmq';
import { MessagingService } from './messaging.service';
import type { OutboundJobData } from './messaging.types';

describe('MessagingService', () => {
  const tenant = { id: 'tenant-1' } as Tenant;

  function build() {
    const outboundQueue = {
      add: jest.fn().mockResolvedValue({}),
    } as unknown as Queue<OutboundJobData>;
    return { service: new MessagingService(outboundQueue), outboundQueue };
  }

  it('sendText encola un job kind=text con reintentos configurados', async () => {
    const { service, outboundQueue } = build();

    await service.sendText(tenant, '5491100000000', 'hola');

    expect(outboundQueue.add).toHaveBeenCalledWith(
      'send',
      { kind: 'text', tenantId: 'tenant-1', to: '5491100000000', body: 'hola' },
      expect.objectContaining({ attempts: 5, backoff: expect.any(Object) }),
    );
  });

  it('sendImage encola un job kind=image con link y caption', async () => {
    const { service, outboundQueue } = build();

    await service.sendImage(
      tenant,
      '5491100000000',
      'https://img/1.jpg',
      'lindo depto',
    );

    expect(outboundQueue.add).toHaveBeenCalledWith(
      'send',
      {
        kind: 'image',
        tenantId: 'tenant-1',
        to: '5491100000000',
        imageUrl: 'https://img/1.jpg',
        caption: 'lindo depto',
      },
      expect.any(Object),
    );
  });

  it('markAsRead encola un job kind=read con el waMessageId', async () => {
    const { service, outboundQueue } = build();

    await service.markAsRead(tenant, 'wamid.in.1');

    expect(outboundQueue.add).toHaveBeenCalledWith(
      'send',
      { kind: 'read', tenantId: 'tenant-1', waMessageId: 'wamid.in.1' },
      expect.any(Object),
    );
  });

  it('sendTemplate encola un job kind=template con nombre/idioma/parámetros', async () => {
    const { service, outboundQueue } = build();

    await service.sendTemplate(tenant, '5491100000000', 'lead_alert', [
      'Juan',
      '5491100000000',
    ]);

    expect(outboundQueue.add).toHaveBeenCalledWith(
      'send',
      {
        kind: 'template',
        tenantId: 'tenant-1',
        to: '5491100000000',
        templateName: 'lead_alert',
        languageCode: 'es_AR',
        bodyParams: ['Juan', '5491100000000'],
      },
      expect.any(Object),
    );
  });
});
