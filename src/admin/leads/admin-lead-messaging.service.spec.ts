import {
  BadGatewayException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { ConversationState } from '@prisma/client';
import type { Lead, Tenant } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import type { MessagingService } from '../../messaging/messaging.service';
import type { TenantsService } from '../../tenants/tenants.service';
import type { DebounceBufferService } from '../../pipeline/debounce-buffer.service';
import { AdminLeadsService } from './admin-leads.service';
import {
  AdminLeadMessagingService,
  LEAD_LOCKED_MESSAGE,
  LEAD_OPTED_OUT_MESSAGE,
} from './admin-lead-messaging.service';
import { SERVICE_WINDOW_CLOSED_MESSAGE } from './service-window.util';

/**
 * Unit de `AdminLeadMessagingService.sendManual` con Prisma, Messaging,
 * Tenants y DebounceBuffer mockeados. La `$transaction` interactiva se simula
 * ejecutando el callback con un cliente `tx` que expone los mismos mocks, así
 * se puede espiar qué corrió dentro y qué fuera, y `withLeadLock` se simula
 * ejecutando `fn` (o devolviendo `null` cuando el lock está tomado).
 *
 * Un array `calls` registra el orden real de las operaciones para poder
 * assertar el invariante de AC-1/AC-12: `withLeadLock` → `$transaction`
 * (commit) → `sendText`.
 */

const TENANT_ID = 'tenant-1';
const LEAD_ID = 'lead-1';
const PERSON_ID = 'person-1';
const TEXT = 'Hola, soy Ana de la inmobiliaria.';

function leadRow(overrides: Partial<Lead> = {}): Lead {
  return {
    id: LEAD_ID,
    tenantId: TENANT_ID,
    phone: '5491122334455',
    state: ConversationState.QUALIFICATION,
    handoffAt: null,
    optedOutAt: null,
    ...overrides,
  } as unknown as Lead;
}

/** Captura el error de una promesa rechazada para assertar tipo Y mensaje. */
async function captureError(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise;
  } catch (error) {
    return error as Error;
  }
  throw new Error('Se esperaba que la promesa rechazara y resolvió');
}

function build(options: { lockFree?: boolean } = {}) {
  const calls: string[] = [];
  const tenant = { id: TENANT_ID } as unknown as Tenant;

  const leadUpdateMany = jest.fn(() => {
    calls.push('updateMany');
    return Promise.resolve({ count: 1 });
  });
  const messageCreate = jest.fn((args: { data: unknown }) => {
    calls.push('message.create');
    return Promise.resolve({ id: 'message-1', ...(args.data as object) });
  });
  const messageFindFirst = jest.fn(() =>
    Promise.resolve<{ createdAt: Date } | null>({ createdAt: new Date() }),
  );
  const messageDeleteMany = jest.fn(() => {
    calls.push('message.deleteMany');
    return Promise.resolve({ count: 1 });
  });
  const leadFindFirst = jest.fn(() => Promise.resolve<Lead | null>(leadRow()));

  const tx = {
    lead: { updateMany: leadUpdateMany, findFirst: leadFindFirst },
    message: { create: messageCreate },
  };

  const prisma = {
    lead: { findFirst: leadFindFirst },
    message: {
      findFirst: messageFindFirst,
      deleteMany: messageDeleteMany,
    },
    $transaction: jest.fn(
      async (cb: (client: typeof tx) => Promise<unknown>) => {
        calls.push('$transaction:start');
        const result = await cb(tx);
        calls.push('$transaction:commit');
        return result;
      },
    ),
  } as unknown as PrismaService;

  const sendText = jest.fn(() => {
    calls.push('sendText');
    return Promise.resolve();
  });
  const messaging = { sendText } as unknown as MessagingService;

  const tenants = {
    findById: jest.fn(() => Promise.resolve<Tenant | null>(tenant)),
  } as unknown as TenantsService;

  const withLeadLock = jest.fn(
    (_tenantId: string, _leadId: string, fn: () => Promise<unknown>) => {
      calls.push('withLeadLock');
      if (options.lockFree === false) {
        return Promise.resolve(null);
      }
      return fn();
    },
  );
  const debounceBuffer = {
    withLeadLock,
  } as unknown as DebounceBufferService;

  const leads = new AdminLeadsService(prisma);
  const service = new AdminLeadMessagingService(
    prisma,
    leads,
    messaging,
    tenants,
    debounceBuffer,
  );

  return {
    service,
    prisma,
    calls,
    tenant,
    leadFindFirst,
    leadUpdateMany,
    messageCreate,
    messageFindFirst,
    messageDeleteMany,
    sendText,
    withLeadLock,
    tenants,
  };
}

describe('AdminLeadMessagingService.sendManual', () => {
  it('AC-1/AC-12: happy path — lock, tx y recién post-commit el encolado con el messageId', async () => {
    const ctx = build();

    const result = await ctx.service.sendManual(
      TENANT_ID,
      LEAD_ID,
      PERSON_ID,
      TEXT,
    );

    // El orden es el invariante crítico: nada se envía antes del commit.
    expect(ctx.calls).toEqual([
      'withLeadLock',
      '$transaction:start',
      'updateMany',
      'message.create',
      '$transaction:commit',
      'sendText',
    ]);

    expect(ctx.leadUpdateMany).toHaveBeenCalledWith({
      where: {
        id: LEAD_ID,
        tenantId: TENANT_ID,
        state: { not: ConversationState.OPTED_OUT },
      },
      data: {
        state: ConversationState.HUMAN_HANDOFF,
        handoffAt: expect.any(Date),
      },
    });

    const createArgs = ctx.messageCreate.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(createArgs.data).toEqual({
      tenantId: TENANT_ID,
      leadId: LEAD_ID,
      direction: 'OUT',
      type: 'TEXT',
      body: TEXT,
      sentByPersonId: PERSON_ID,
    });

    expect(ctx.sendText).toHaveBeenCalledWith(
      ctx.tenant,
      '5491122334455',
      TEXT,
      { messageId: 'message-1' },
    );
    expect(ctx.messageDeleteMany).not.toHaveBeenCalled();
    expect(result.message).toEqual(
      expect.objectContaining({ id: 'message-1', body: TEXT }),
    );
    expect(result.lead).toEqual(expect.objectContaining({ id: LEAD_ID }));

    // El lock envuelve todo el bloque, con la key del lead correcto.
    expect(ctx.withLeadLock).toHaveBeenCalledWith(
      TENANT_ID,
      LEAD_ID,
      expect.any(Function),
    );
  });

  it('AC-13: lead inexistente o de otro tenant → 404 sin side effects', async () => {
    const ctx = build();
    ctx.leadFindFirst.mockResolvedValue(null);

    await expect(
      ctx.service.sendManual(TENANT_ID, LEAD_ID, PERSON_ID, TEXT),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(ctx.leadFindFirst).toHaveBeenCalledWith({
      where: { id: LEAD_ID, tenantId: TENANT_ID },
    });
    expect(ctx.withLeadLock).not.toHaveBeenCalled();
    expect(ctx.messageCreate).not.toHaveBeenCalled();
    expect(ctx.sendText).not.toHaveBeenCalled();
  });

  it('AC-2 [CRÍTICO]: lead OPTED_OUT → 409 sin message.create ni sendText', async () => {
    const ctx = build();
    ctx.leadFindFirst.mockResolvedValue(
      leadRow({ state: ConversationState.OPTED_OUT }),
    );

    const error = await captureError(
      ctx.service.sendManual(TENANT_ID, LEAD_ID, PERSON_ID, TEXT),
    );
    expect(error).toBeInstanceOf(ConflictException);
    expect(error.message).toBe(LEAD_OPTED_OUT_MESSAGE);

    expect(ctx.withLeadLock).not.toHaveBeenCalled();
    expect(ctx.leadUpdateMany).not.toHaveBeenCalled();
    expect(ctx.messageCreate).not.toHaveBeenCalled();
    expect(ctx.sendText).not.toHaveBeenCalled();
  });

  it('AC-3: sin ningún Message IN → 409 con el copy de template, sin side effects', async () => {
    const ctx = build();
    ctx.messageFindFirst.mockResolvedValue(null);

    const error = await captureError(
      ctx.service.sendManual(TENANT_ID, LEAD_ID, PERSON_ID, TEXT),
    );
    expect(error).toBeInstanceOf(ConflictException);
    expect(error.message).toBe(SERVICE_WINDOW_CLOSED_MESSAGE);

    expect(ctx.messageFindFirst).toHaveBeenCalledWith({
      where: { tenantId: TENANT_ID, leadId: LEAD_ID, direction: 'IN' },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    expect(ctx.withLeadLock).not.toHaveBeenCalled();
    expect(ctx.messageCreate).not.toHaveBeenCalled();
    expect(ctx.sendText).not.toHaveBeenCalled();
  });

  it('AC-3: último Message IN de 24hs o más → 409 sin side effects (borde cerrado)', async () => {
    const ctx = build();
    ctx.messageFindFirst.mockResolvedValue({
      createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
    });

    await expect(
      ctx.service.sendManual(TENANT_ID, LEAD_ID, PERSON_ID, TEXT),
    ).rejects.toThrow(SERVICE_WINDOW_CLOSED_MESSAGE);

    expect(ctx.withLeadLock).not.toHaveBeenCalled();
    expect(ctx.messageCreate).not.toHaveBeenCalled();
    expect(ctx.sendText).not.toHaveBeenCalled();
  });

  it('AC-3: último Message IN de 23:59hs → pasa la ventana y envía', async () => {
    const ctx = build();
    ctx.messageFindFirst.mockResolvedValue({
      createdAt: new Date(Date.now() - (24 * 60 * 60 * 1000 - 60_000)),
    });

    await expect(
      ctx.service.sendManual(TENANT_ID, LEAD_ID, PERSON_ID, TEXT),
    ).resolves.toBeDefined();
    expect(ctx.sendText).toHaveBeenCalledTimes(1);
  });

  it('AC-7 [CRÍTICO]: lock tomado por un turno del bot → 409 sin tx ni sendText', async () => {
    const ctx = build({ lockFree: false });

    const error = await captureError(
      ctx.service.sendManual(TENANT_ID, LEAD_ID, PERSON_ID, TEXT),
    );
    expect(error).toBeInstanceOf(ConflictException);
    expect(error.message).toBe(LEAD_LOCKED_MESSAGE);

    expect(ctx.withLeadLock).toHaveBeenCalledTimes(1);
    expect(ctx.leadUpdateMany).not.toHaveBeenCalled();
    expect(ctx.messageCreate).not.toHaveBeenCalled();
    expect(ctx.sendText).not.toHaveBeenCalled();
  });

  it('AC-2 (carrera): updateMany afecta 0 filas (opt-out concurrente) → rollback + 409 sin sendText', async () => {
    const ctx = build();
    ctx.leadUpdateMany.mockImplementation(() => Promise.resolve({ count: 0 }));

    const error = await captureError(
      ctx.service.sendManual(TENANT_ID, LEAD_ID, PERSON_ID, TEXT),
    );
    expect(error).toBeInstanceOf(ConflictException);
    expect(error.message).toBe(LEAD_OPTED_OUT_MESSAGE);

    // La excepción dentro del callback aborta la tx: el Message nunca se crea
    // y el commit nunca ocurre.
    expect(ctx.messageCreate).not.toHaveBeenCalled();
    expect(ctx.calls).not.toContain('$transaction:commit');
    expect(ctx.sendText).not.toHaveBeenCalled();
  });

  it('encolado fallido → delete compensatorio del Message y 502', async () => {
    const ctx = build();
    ctx.sendText.mockRejectedValue(new Error('redis caído'));

    await expect(
      ctx.service.sendManual(TENANT_ID, LEAD_ID, PERSON_ID, TEXT),
    ).rejects.toBeInstanceOf(BadGatewayException);

    expect(ctx.messageDeleteMany).toHaveBeenCalledWith({
      where: { id: 'message-1', tenantId: TENANT_ID },
    });
    // El borrado compensatorio corre después del intento de envío, dentro del lock.
    expect(ctx.calls).toEqual([
      'withLeadLock',
      '$transaction:start',
      'updateMany',
      'message.create',
      '$transaction:commit',
      'message.deleteMany',
    ]);
  });

  it('si el delete compensatorio también falla, igual propaga el 502 original', async () => {
    const ctx = build();
    ctx.sendText.mockRejectedValue(new Error('redis caído'));
    ctx.messageDeleteMany.mockRejectedValue(new Error('db caída'));

    await expect(
      ctx.service.sendManual(TENANT_ID, LEAD_ID, PERSON_ID, TEXT),
    ).rejects.toBeInstanceOf(BadGatewayException);
  });

  it('tenant inexistente → 404 sin tomar el lock ni escribir', async () => {
    const ctx = build();
    (ctx.tenants.findById as jest.Mock).mockResolvedValue(null);

    await expect(
      ctx.service.sendManual(TENANT_ID, LEAD_ID, PERSON_ID, TEXT),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(ctx.withLeadLock).not.toHaveBeenCalled();
    expect(ctx.messageCreate).not.toHaveBeenCalled();
    expect(ctx.sendText).not.toHaveBeenCalled();
  });
});
