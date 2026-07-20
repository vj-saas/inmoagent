import { randomBytes } from 'node:crypto';
import type { ConfigService } from '@nestjs/config';
import type { Tenant } from '@prisma/client';
import { encrypt } from '../common/crypto';
import type { EnvConfig } from '../config/env.schema';
import type { PrismaService } from '../prisma/prisma.service';
import { TenantsService } from './tenants.service';

describe('TenantsService', () => {
  const key = randomBytes(32).toString('hex');

  function build(tenant: Partial<Tenant> | null) {
    const prisma = {
      tenant: { findUnique: jest.fn().mockResolvedValue(tenant) },
    } as unknown as PrismaService;
    const config = {
      get: jest.fn().mockReturnValue(key),
    } as unknown as ConfigService<EnvConfig, true>;
    return { service: new TenantsService(prisma, config), prisma };
  }

  it('busca el tenant por phoneNumberId', async () => {
    const { service, prisma } = build({
      id: 't1',
      phoneNumberId: 'phone-1',
    });

    const result = await service.findByPhoneNumberId('phone-1');

    expect(prisma.tenant.findUnique).toHaveBeenCalledWith({
      where: { phoneNumberId: 'phone-1' },
    });
    expect(result?.id).toBe('t1');
  });

  it('descifra el accessTokenEnc del tenant', () => {
    const plaintext = 'meta-access-token-secreto';
    const { service } = build(null);
    const tenant = { accessTokenEnc: encrypt(plaintext, key) } as Tenant;

    expect(service.getDecryptedAccessToken(tenant)).toBe(plaintext);
  });
});
