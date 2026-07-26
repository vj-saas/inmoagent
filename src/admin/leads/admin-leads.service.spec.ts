import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  ConversationState,
  OperationType,
  type Lead,
  type Prisma,
} from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import { AdminLeadsService } from './admin-leads.service';

const TENANT = 'tenant-1';
const LEAD = 'lead-1';

function lead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: LEAD,
    tenantId: TENANT,
    state: ConversationState.HUMAN_HANDOFF,
    handoffAt: new Date('2026-07-20T10:00:00Z'),
    lastSearchIds: [],
    fOperation: null,
    ...overrides,
  } as unknown as Lead;
}

/**
 * `$transaction` interactivo: ejecuta el callback con un `tx` que expone los
 * mismos mocks, para poder assertar qué se llamó DENTRO de la transacción.
 */
function build(options: { found?: Lead | null; count?: number } = {}) {
  const findFirst = jest
    .fn()
    .mockResolvedValue(options.found === undefined ? lead() : options.found);
  const updateMany = jest.fn().mockResolvedValue({ count: options.count ?? 1 });

  const tx = { lead: { findFirst, updateMany } };
  const prisma = {
    lead: { findFirst, updateMany },
    $transaction: jest.fn((cb: (t: typeof tx) => unknown) => cb(tx)),
  } as unknown as PrismaService;

  return { service: new AdminLeadsService(prisma), findFirst, updateMany };
}

function updateArgs(updateMany: jest.Mock): Prisma.LeadUpdateManyArgs {
  const calls = updateMany.mock.calls as Prisma.LeadUpdateManyArgs[][];
  return calls[0][0];
}

describe('AdminLeadsService.release', () => {
  it('con lastSearchIds no vacío vuelve a SEARCH_MATCH y limpia handoffAt (AC-8)', async () => {
    const { service, updateMany } = build({
      found: lead({ lastSearchIds: ['prop-1', 'prop-2'] }),
    });

    await expect(service.release(TENANT, LEAD)).resolves.toEqual({
      released: true,
    });

    expect(updateArgs(updateMany).data).toEqual({
      state: ConversationState.SEARCH_MATCH,
      handoffAt: null,
    });
  });

  it('con lastSearchIds vacío vuelve a QUALIFICATION aunque fOperation esté seteado (AC-9)', async () => {
    const { service, updateMany } = build({
      found: lead({ lastSearchIds: [], fOperation: OperationType.RENT }),
    });

    await service.release(TENANT, LEAD);

    expect(updateArgs(updateMany).data).toEqual({
      state: ConversationState.QUALIFICATION,
      handoffAt: null,
    });
  });

  it('exige HUMAN_HANDOFF y el tenant propio en el WHERE del updateMany (atómico)', async () => {
    const { service, updateMany } = build();

    await service.release(TENANT, LEAD);

    expect(updateArgs(updateMany).where).toEqual({
      id: LEAD,
      tenantId: TENANT,
      state: ConversationState.HUMAN_HANDOFF,
    });
  });

  it('si el lead no está en HUMAN_HANDOFF (0 filas afectadas) responde 400 sin cambios (AC-11)', async () => {
    // El lead leído dice QUALIFICATION, pero quien decide es el updateMany:
    // count 0 significa que la condición del WHERE no se cumplió y no se
    // escribió nada.
    const { service } = build({
      found: lead({ state: ConversationState.QUALIFICATION, handoffAt: null }),
      count: 0,
    });

    await expect(service.release(TENANT, LEAD)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(service.release(TENANT, LEAD)).rejects.toThrow(
      'El lead no está en HUMAN_HANDOFF',
    );
  });

  it('rechaza con 400 si otro proceso ganó la carrera entre la lectura y el write', async () => {
    // Lectura en HUMAN_HANDOFF (pasa el findLeadOrThrow) pero el bot/otro click
    // ya lo movió: el updateMany no afecta filas y no se pisa el estado nuevo.
    const { service } = build({
      found: lead({ lastSearchIds: ['prop-1'] }),
      count: 0,
    });

    await expect(service.release(TENANT, LEAD)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('un lead de otro tenant da 404 y no se toca (aislamiento multi-tenant)', async () => {
    const { service, findFirst, updateMany } = build({ found: null });

    await expect(service.release('tenant-ajeno', LEAD)).rejects.toBeInstanceOf(
      NotFoundException,
    );

    expect(findFirst).toHaveBeenCalledWith({
      where: { id: LEAD, tenantId: 'tenant-ajeno' },
    });
    expect(updateMany).not.toHaveBeenCalled();
  });
});
