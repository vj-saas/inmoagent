import { ConflictException, NotFoundException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import * as argon2 from 'argon2';
import { randomBytes } from 'node:crypto';
import type { EnvConfig } from '../../config/env.schema';
import type { PrismaService } from '../../prisma/prisma.service';
import type { CreateTenantDto } from './create-tenant.dto';
import type { UpdateTenantConfigDto } from './update-tenant-config.dto';
import { TenantsAdminService } from './tenants-admin.service';

const ENCRYPTION_KEY = randomBytes(32).toString('hex');

function dto(overrides: Partial<CreateTenantDto> = {}): CreateTenantDto {
  return {
    name: 'Inmobiliaria X',
    slug: 'inmobiliaria-x',
    phoneNumberId: 'phone-x',
    accessToken: 'meta-token-plano',
    ...overrides,
  };
}

interface CapturedCreateArgs {
  data: { accessTokenEnc: string; apiKeyHash: string };
}

function build() {
  let capturedArgs: unknown;
  const create = jest.fn().mockImplementation((args: unknown) => {
    capturedArgs = args;
    return Promise.resolve({ id: 'tenant-1' });
  });
  const webhookEventFindFirst = jest.fn().mockResolvedValue(null);
  const leadFindFirst = jest.fn().mockResolvedValue(null);
  const update = jest.fn().mockResolvedValue({ id: 'tenant-1' });
  const tenantFindFirst = jest.fn().mockResolvedValue({ id: 'tenant-1' });
  const prisma = {
    tenant: { create, update, findFirst: tenantFindFirst },
    webhookEvent: { findFirst: webhookEventFindFirst },
    lead: { findFirst: leadFindFirst },
  } as unknown as PrismaService;
  const config = {
    get: jest.fn().mockReturnValue(ENCRYPTION_KEY),
  } as unknown as ConfigService<EnvConfig, true>;
  return {
    service: new TenantsAdminService(prisma, config),
    prisma,
    create,
    update,
    tenantFindFirst,
    webhookEventFindFirst,
    leadFindFirst,
    getCapturedArgs: () => capturedArgs as CapturedCreateArgs,
  };
}

describe('TenantsAdminService', () => {
  it('crea el tenant con el token cifrado y devuelve una API key en texto plano', async () => {
    const { service, getCapturedArgs } = build();

    const result = await service.create(dto());

    expect(result.tenantId).toBe('tenant-1');
    expect(result.apiKey).toMatch(/^live_[a-f0-9]{48}$/);

    const callArgs = getCapturedArgs();
    expect(callArgs.data.accessTokenEnc).not.toBe('meta-token-plano');
    expect(callArgs.data.accessTokenEnc.split(':')).toHaveLength(3); // formato iv:authTag:ciphertext
    await expect(
      argon2.verify(callArgs.data.apiKeyHash, result.apiKey),
    ).resolves.toBe(true);
  });

  it('lanza ConflictException si el slug o phoneNumberId ya existen', async () => {
    const { service, create } = build();
    create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '7.8.0',
      }),
    );

    await expect(service.create(dto())).rejects.toThrow(ConflictException);
  });
});

describe('TenantsAdminService.webhookStatus', () => {
  it('devuelve connected:false y fechas null si no hay eventos ni leads con mensaje', async () => {
    const { service } = build();

    const result = await service.webhookStatus('tenant-1');

    expect(result).toEqual({
      connected: false,
      lastEventAt: null,
      lastMessageAt: null,
    });
  });

  it('devuelve connected:true y lastEventAt cuando hay un WebhookEvent', async () => {
    const { service, webhookEventFindFirst } = build();
    const receivedAt = new Date('2026-07-20T10:00:00Z');
    webhookEventFindFirst.mockResolvedValue({ receivedAt });

    const result = await service.webhookStatus('tenant-1');

    expect(result.connected).toBe(true);
    expect(result.lastEventAt).toBe(receivedAt);
    expect(result.lastMessageAt).toBeNull();
    expect(webhookEventFindFirst).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-1' },
      orderBy: { receivedAt: 'desc' },
      select: { receivedAt: true },
    });
  });

  it('filtra leads con lastMessageAt null y devuelve el máximo del no-nulo', async () => {
    const { service, leadFindFirst } = build();
    const lastMessageAt = new Date('2026-07-22T15:30:00Z');
    // Simula que la query ya excluye lastMessageAt: null (NULLS FIRST en Postgres
    // haría que el lead sin mensajes "ganara" el orderBy si no se filtrara).
    leadFindFirst.mockResolvedValue({ lastMessageAt });

    const result = await service.webhookStatus('tenant-1');

    expect(result.connected).toBe(true);
    expect(result.lastMessageAt).toBe(lastMessageAt);
    expect(leadFindFirst).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-1', lastMessageAt: { not: null } },
      orderBy: { lastMessageAt: 'desc' },
      select: { lastMessageAt: true },
    });
  });
});

describe('TenantsAdminService.updateConfig', () => {
  it('arma `data` solo con el subconjunto de campos presentes en el dto', async () => {
    const { service, update } = build();
    const dto: UpdateTenantConfigDto = {
      alertPhone: '+5491100000000',
      alertsEnabled: true,
    };

    await service.updateConfig('tenant-1', dto);

    expect(update).toHaveBeenCalledWith({
      where: { id: 'tenant-1' },
      data: { alertPhone: '+5491100000000', alertsEnabled: true },
      select: expect.any(Object),
    });
  });

  it('normaliza welcomeIntro vacío a null en el `data` pasado a Prisma', async () => {
    const { service, update } = build();

    await service.updateConfig('tenant-1', { welcomeIntro: '' });

    expect(update).toHaveBeenCalledWith({
      where: { id: 'tenant-1' },
      data: { welcomeIntro: null },
      select: expect.any(Object),
    });
  });

  it('normaliza un string de solo espacios a null', async () => {
    const { service, update } = build();

    await service.updateConfig('tenant-1', { humanHours: '   ' });

    expect(update).toHaveBeenCalledWith({
      where: { id: 'tenant-1' },
      data: { humanHours: null },
      select: expect.any(Object),
    });
  });

  it('con dto vacío no llama a prisma.tenant.update, hace una lectura en su lugar', async () => {
    const { service, update, tenantFindFirst } = build();

    await service.updateConfig('tenant-1', {});

    expect(update).not.toHaveBeenCalled();
    expect(tenantFindFirst).toHaveBeenCalledWith({
      where: { id: 'tenant-1' },
      select: expect.any(Object),
    });
  });

  it('lanza NotFoundException si Prisma responde P2025 al actualizar', async () => {
    const { service, update } = build();
    update.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Record not found', {
        code: 'P2025',
        clientVersion: '7.8.0',
      }),
    );

    await expect(
      service.updateConfig('tenant-1', { alertPhone: '123' }),
    ).rejects.toThrow(NotFoundException);
  });
});
