import { UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import type { Tenant } from '@prisma/client';
import * as argon2 from 'argon2';
import type { PrismaService } from '../../prisma/prisma.service';
import {
  TenantApiKeyGuard,
  type AuthenticatedAdminRequest,
} from './tenant-api-key.guard';

function contextWith(
  headers: Record<string, string>,
  params: Record<string, string>,
): ExecutionContext {
  const request = { headers, params } as unknown as AuthenticatedAdminRequest;
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('TenantApiKeyGuard', () => {
  const realApiKey = 'demo-api-key-12345';
  let tenant: Tenant;
  let findUnique: jest.Mock;
  let guard: TenantApiKeyGuard;

  beforeAll(async () => {
    tenant = {
      id: 'tenant-1',
      apiKeyHash: await argon2.hash(realApiKey),
    } as Tenant;
  });

  beforeEach(() => {
    findUnique = jest.fn().mockResolvedValue(tenant);
    const prisma = { tenant: { findUnique } } as unknown as PrismaService;
    guard = new TenantApiKeyGuard(prisma);
  });

  it('permite el acceso con una API key válida para el tenant de la ruta', async () => {
    const ctx = contextWith(
      { 'x-api-key': realApiKey },
      { tenantId: 'tenant-1' },
    );

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(findUnique).toHaveBeenCalledWith({ where: { id: 'tenant-1' } });
  });

  it('rechaza si falta el header X-Api-Key', async () => {
    const ctx = contextWith({}, { tenantId: 'tenant-1' });
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('rechaza una API key incorrecta', async () => {
    const ctx = contextWith(
      { 'x-api-key': 'key-incorrecta' },
      { tenantId: 'tenant-1' },
    );
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('rechaza si el tenant de la ruta no existe', async () => {
    findUnique.mockResolvedValue(null);
    const ctx = contextWith(
      { 'x-api-key': realApiKey },
      { tenantId: 'tenant-inexistente' },
    );
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('no deja pasar la API key de un tenant en la ruta de otro tenant', async () => {
    findUnique.mockResolvedValue({
      id: 'tenant-2',
      apiKeyHash: await argon2.hash('otra-key'),
    });
    const ctx = contextWith(
      { 'x-api-key': realApiKey },
      { tenantId: 'tenant-2' },
    );
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });
});
