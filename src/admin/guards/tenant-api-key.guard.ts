import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Tenant } from '@prisma/client';
import * as argon2 from 'argon2';
import type { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';

export interface AuthenticatedAdminRequest extends Request {
  tenant: Tenant;
}

const GENERIC_AUTH_ERROR = 'Tenant o API key inválidos';

/**
 * Autentica un request admin scopeado a un tenant (`:tenantId` en la ruta) vía
 * header `X-Api-Key`, verificado contra `tenant.apiKeyHash` (argon2). La Fase 6
 * suma el master key de plataforma para operaciones cross-tenant.
 */
@Injectable()
export class TenantApiKeyGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<AuthenticatedAdminRequest>();
    const apiKey = request.headers['x-api-key'];
    const tenantId = request.params.tenantId;

    if (
      typeof apiKey !== 'string' ||
      !apiKey ||
      typeof tenantId !== 'string' ||
      !tenantId
    ) {
      throw new UnauthorizedException(GENERIC_AUTH_ERROR);
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });
    if (!tenant) {
      throw new UnauthorizedException(GENERIC_AUTH_ERROR);
    }

    const valid = await argon2
      .verify(tenant.apiKeyHash, apiKey)
      .catch(() => false);
    if (!valid) {
      throw new UnauthorizedException(GENERIC_AUTH_ERROR);
    }

    request.tenant = tenant;
    return true;
  }
}
