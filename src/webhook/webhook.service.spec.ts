import {
  MessageDirection,
  MessageType,
  Prisma,
  type Tenant,
} from '@prisma/client';
import type { Queue } from 'bullmq';
import type { LeadsService } from '../leads/leads.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { TenantsService } from '../tenants/tenants.service';
import type { MetaWebhookPayload } from './meta-webhook.types';
import { WebhookService } from './webhook.service';

const TENANT: Tenant = {
  id: 'tenant-1',
  phoneNumberId: 'phone-1',
} as Tenant;

function duplicateKeyError() {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: '7.8.0',
  });
}

function build() {
  const prisma = {
    webhookEvent: { create: jest.fn().mockResolvedValue({}) },
    message: {
      create: jest.fn().mockResolvedValue({ id: 'message-1' }),
      findUnique: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue({}),
    },
  } as unknown as PrismaService;

  const tenants = {
    findByPhoneNumberId: jest.fn().mockResolvedValue(TENANT),
  } as unknown as TenantsService;
  const leads = {
    findOrCreateByPhone: jest.fn().mockResolvedValue({ id: 'lead-1' }),
  } as unknown as LeadsService;
  const inboundQueue = {
    add: jest.fn().mockResolvedValue({}),
  } as unknown as Queue;
  const mediaQueue = {
    add: jest.fn().mockResolvedValue({}),
  } as unknown as Queue;

  const pushNotifications = {
    notifyAppointmentAssigned: jest.fn().mockResolvedValue({}),
  } as unknown as any;

  const service = new WebhookService(
    prisma,
    tenants,
    leads,
    pushNotifications,
    inboundQueue,
    mediaQueue,
  );
  return { service, prisma, tenants, leads, inboundQueue, mediaQueue, pushNotifications };
}

function textPayload(
  overrides: { phoneNumberId?: string; messageId?: string } = {},
): MetaWebhookPayload {
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'waba-1',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: {
                phone_number_id: overrides.phoneNumberId ?? 'phone-1',
              },
              messages: [
                {
                  from: '5491100000000',
                  id: overrides.messageId ?? 'wamid.1',
                  timestamp: '1706000000',
                  type: 'text',
                  text: { body: 'hola' },
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

describe('WebhookService', () => {
  it('persiste el mensaje IN y lo encola en inbound para texto', async () => {
    const { service, prisma, leads, inboundQueue, mediaQueue } = build();

    await service.handlePayload(textPayload());

    expect(leads.findOrCreateByPhone).toHaveBeenCalledWith(
      'tenant-1',
      '5491100000000',
    );
    expect(prisma.message.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: 'tenant-1',
          leadId: 'lead-1',
          direction: MessageDirection.IN,
          type: MessageType.TEXT,
          waMessageId: 'wamid.1',
          body: 'hola',
        }),
      }),
    );
    expect(inboundQueue.add).toHaveBeenCalledWith('process-message', {
      tenantId: 'tenant-1',
      leadId: 'lead-1',
      messageId: 'message-1',
    });
    expect(mediaQueue.add).not.toHaveBeenCalled();
  });

  it('encola audio/imagen en la cola media en lugar de inbound', async () => {
    const { service, mediaQueue, inboundQueue } = build();
    const payload = textPayload();
    payload.entry[0].changes[0].value.messages![0].type = 'audio';
    payload.entry[0].changes[0].value.messages![0].audio = { id: 'media-1' };
    delete payload.entry[0].changes[0].value.messages![0].text;

    await service.handlePayload(payload);

    expect(mediaQueue.add).toHaveBeenCalled();
    expect(inboundQueue.add).not.toHaveBeenCalled();
  });

  it('ignora el mensaje si el phone_number_id no tiene tenant', async () => {
    const { service, tenants, prisma } = build();
    (tenants.findByPhoneNumberId as jest.Mock).mockResolvedValue(null);

    await service.handlePayload(
      textPayload({ phoneNumberId: 'phone-desconocido' }),
    );

    expect(prisma.message.create).not.toHaveBeenCalled();
  });

  it('no duplica el mensaje ni el job cuando el wa_message_id ya fue procesado (retry de Meta)', async () => {
    const { service, prisma, inboundQueue } = build();
    (prisma.webhookEvent.create as jest.Mock).mockRejectedValueOnce(
      duplicateKeyError(),
    );

    await service.handlePayload(textPayload({ messageId: 'wamid.repetido' }));

    expect(prisma.message.create).not.toHaveBeenCalled();
    expect(inboundQueue.add).not.toHaveBeenCalled();
  });

  it('mapea tipos no soportados a UNSUPPORTED sin romper', async () => {
    const { service, prisma } = build();
    const payload = textPayload();
    payload.entry[0].changes[0].value.messages![0].type = 'sticker';
    delete payload.entry[0].changes[0].value.messages![0].text;

    await service.handlePayload(payload);

    expect(prisma.message.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: MessageType.UNSUPPORTED }),
      }),
    );
  });
});
