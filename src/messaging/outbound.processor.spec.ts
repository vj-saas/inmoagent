import type { Tenant } from '@prisma/client';
import type { Job } from 'bullmq';
import type { LeadsService } from '../leads/leads.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { TenantsService } from '../tenants/tenants.service';
import type { MetaGraphClient } from './meta-graph.client';
import type { OutboundJobData } from './messaging.types';
import { OutboundProcessor } from './outbound.processor';

const TENANT = { id: 'tenant-1', phoneNumberId: 'phone-1' } as Tenant;

function build() {
  const tenants = {
    findById: jest.fn().mockResolvedValue(TENANT),
    getDecryptedAccessToken: jest.fn().mockReturnValue('token-abc'),
  } as unknown as TenantsService;
  const leads = {
    findOrCreateByPhone: jest.fn().mockResolvedValue({ id: 'lead-1' }),
  } as unknown as LeadsService;
  const prisma = {
    message: {
      create: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  } as unknown as PrismaService;
  const graphClient = {
    sendText: jest.fn().mockResolvedValue({ waMessageId: 'wamid.out.1' }),
    sendImage: jest.fn().mockResolvedValue({ waMessageId: 'wamid.out.2' }),
    markAsRead: jest.fn().mockResolvedValue(undefined),
    sendTemplate: jest.fn().mockResolvedValue({ waMessageId: 'wamid.out.3' }),
  } as unknown as MetaGraphClient;

  const processor = new OutboundProcessor(tenants, leads, prisma, graphClient);
  return { processor, tenants, leads, prisma, graphClient };
}

function job(data: OutboundJobData): Job<OutboundJobData> {
  return { data } as Job<OutboundJobData>;
}

describe('OutboundProcessor', () => {
  it('envía texto vía MetaGraphClient y persiste el Message OUT', async () => {
    const { processor, graphClient, prisma } = build();

    await processor.process(
      job({
        kind: 'text',
        tenantId: 'tenant-1',
        to: '5491100000000',
        body: 'hola',
      }),
    );

    expect(graphClient.sendText).toHaveBeenCalledWith(
      'phone-1',
      'token-abc',
      '5491100000000',
      'hola',
    );
    expect(prisma.message.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: 'tenant-1',
          leadId: 'lead-1',
          direction: 'OUT',
          type: 'TEXT',
          waMessageId: 'wamid.out.1',
          body: 'hola',
        }),
      }),
    );
  });

  it('envía imagen con link y caption y persiste el Message OUT', async () => {
    const { processor, graphClient, prisma } = build();

    await processor.process(
      job({
        kind: 'image',
        tenantId: 'tenant-1',
        to: '5491100000000',
        imageUrl: 'https://img/1.jpg',
        caption: 'linda',
      }),
    );

    expect(graphClient.sendImage).toHaveBeenCalledWith(
      'phone-1',
      'token-abc',
      '5491100000000',
      'https://img/1.jpg',
      'linda',
    );
    expect(prisma.message.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: 'IMAGE', body: 'linda' }),
      }),
    );
  });

  it('markAsRead no persiste ningún Message', async () => {
    const { processor, graphClient, prisma } = build();

    await processor.process(
      job({ kind: 'read', tenantId: 'tenant-1', waMessageId: 'wamid.in.1' }),
    );

    expect(graphClient.markAsRead).toHaveBeenCalledWith(
      'phone-1',
      'token-abc',
      'wamid.in.1',
    );
    expect(prisma.message.create).not.toHaveBeenCalled();
  });

  it('sendTemplate no persiste ningún Message (notificación interna, no es parte de la charla con el lead)', async () => {
    const { processor, graphClient, prisma } = build();

    await processor.process(
      job({
        kind: 'template',
        tenantId: 'tenant-1',
        to: '5491199998888',
        templateName: 'lead_alert',
        languageCode: 'es_AR',
        bodyParams: ['Juan', '5491100000000', 'alquiler caballito', 'Depto A'],
      }),
    );

    expect(graphClient.sendTemplate).toHaveBeenCalledWith(
      'phone-1',
      'token-abc',
      '5491199998888',
      'lead_alert',
      'es_AR',
      ['Juan', '5491100000000', 'alquiler caballito', 'Depto A'],
    );
    expect(prisma.message.create).not.toHaveBeenCalled();
  });

  it('con messageId actualiza el Message ya persistido con el waMessageId, sin crear otro ni tocar el lead', async () => {
    const { processor, graphClient, prisma, leads } = build();

    await processor.process(
      job({
        kind: 'text',
        tenantId: 'tenant-1',
        to: '5491100000000',
        body: 'te escribe Juan del equipo',
        messageId: 'msg-manual-1',
      }),
    );

    expect(graphClient.sendText).toHaveBeenCalledWith(
      'phone-1',
      'token-abc',
      '5491100000000',
      'te escribe Juan del equipo',
    );
    expect(prisma.message.updateMany).toHaveBeenCalledWith({
      where: { id: 'msg-manual-1', tenantId: 'tenant-1' },
      data: { waMessageId: 'wamid.out.1' },
    });
    // Doble persistencia = dos burbujas del mismo texto en la bandeja (AC-7/AC-12).
    expect(prisma.message.create).not.toHaveBeenCalled();
    // `findOrCreateByPhone` contamina `Lead.lastMessageAt` (decisión 4 de la spec).
    expect(leads.findOrCreateByPhone).not.toHaveBeenCalled();
  });

  it('sin messageId mantiene el comportamiento del bot: crea el Message vía findOrCreateByPhone y no actualiza nada', async () => {
    const { processor, prisma, leads } = build();

    await processor.process(
      job({
        kind: 'text',
        tenantId: 'tenant-1',
        to: '5491100000000',
        body: 'hola',
      }),
    );

    expect(leads.findOrCreateByPhone).toHaveBeenCalledWith(
      'tenant-1',
      '5491100000000',
    );
    expect(prisma.message.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: 'tenant-1',
          leadId: 'lead-1',
          direction: 'OUT',
          type: 'TEXT',
          waMessageId: 'wamid.out.1',
          body: 'hola',
        }),
      }),
    );
    expect(prisma.message.updateMany).not.toHaveBeenCalled();
  });

  it('descarta el job sin lanzar si el tenant ya no existe', async () => {
    const { processor, tenants, graphClient } = build();
    (tenants.findById as jest.Mock).mockResolvedValue(null);

    await expect(
      processor.process(
        job({
          kind: 'text',
          tenantId: 'tenant-borrado',
          to: '5491100000000',
          body: 'hola',
        }),
      ),
    ).resolves.toBeUndefined();
    expect(graphClient.sendText).not.toHaveBeenCalled();
  });
});
