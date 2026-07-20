import { ConflictException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import * as argon2 from 'argon2';
import { randomBytes } from 'node:crypto';
import type { EnvConfig } from '../../config/env.schema';
import type { PrismaService } from '../../prisma/prisma.service';
import type { CreateTenantDto } from './create-tenant.dto';
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
  const prisma = { tenant: { create } } as unknown as PrismaService;
  const config = {
    get: jest.fn().mockReturnValue(ENCRYPTION_KEY),
  } as unknown as ConfigService<EnvConfig, true>;
  return {
    service: new TenantsAdminService(prisma, config),
    prisma,
    create,
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
