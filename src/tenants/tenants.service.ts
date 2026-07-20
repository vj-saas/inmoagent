import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Tenant } from '@prisma/client';
import { decrypt } from '../common/crypto';
import type { EnvConfig } from '../config/env.schema';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TenantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<EnvConfig, true>,
  ) {}

  findByPhoneNumberId(phoneNumberId: string): Promise<Tenant | null> {
    return this.prisma.tenant.findUnique({ where: { phoneNumberId } });
  }

  findById(id: string): Promise<Tenant | null> {
    return this.prisma.tenant.findUnique({ where: { id } });
  }

  getDecryptedAccessToken(tenant: Tenant): string {
    return decrypt(
      tenant.accessTokenEnc,
      this.config.get('APP_ENCRYPTION_KEY', { infer: true }),
    );
  }
}
