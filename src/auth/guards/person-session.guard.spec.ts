import { UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import type { Person, Session, Tenant } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import type { AuthenticatedPersonRequest } from '../authenticated-person-request';
import { hashSessionToken } from '../session-token.util';
import { PersonSessionGuard } from './person-session.guard';

type SessionWithPerson = Session & {
  person: Person & { tenant: Tenant };
};

function contextWith(
  headers: Record<string, string | string[]>,
): { ctx: ExecutionContext; request: AuthenticatedPersonRequest } {
  const request = { headers } as unknown as AuthenticatedPersonRequest;
  const ctx = {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return { ctx, request };
}

describe('PersonSessionGuard', () => {
  const validToken = 'a'.repeat(64);
  let findUnique: jest.Mock;
  let guard: PersonSessionGuard;

  function buildSession(
    overrides: {
      expiresAt?: Date;
      personActive?: boolean;
      tenantActive?: boolean;
    } = {},
  ): SessionWithPerson {
    const {
      expiresAt = new Date(Date.now() + 60 * 60 * 1000),
      personActive = true,
      tenantActive = true,
    } = overrides;
    return {
      id: 'session-1',
      tokenHash: hashSessionToken(validToken),
      personId: 'person-1',
      expiresAt,
      createdAt: new Date(),
      person: {
        id: 'person-1',
        tenantId: 'tenant-1',
        email: 'owner@example.com',
        passwordHash: 'hash',
        role: 'OWNER',
        active: personActive,
        createdAt: new Date(),
        updatedAt: new Date(),
        tenant: {
          id: 'tenant-1',
          active: tenantActive,
        } as Tenant,
      } as Person & { tenant: Tenant },
    } as SessionWithPerson;
  }

  beforeEach(() => {
    findUnique = jest.fn();
    const prisma = { session: { findUnique } } as unknown as PrismaService;
    guard = new PersonSessionGuard(prisma);
  });

  it('rechaza (401) sin tocar la DB si falta el header Authorization', async () => {
    const { ctx } = contextWith({});
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('rechaza (401) sin tocar la DB si el header no empieza con "Bearer "', async () => {
    const { ctx } = contextWith({ authorization: `Basic ${validToken}` });
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('rechaza (401) sin tocar la DB si "Bearer " no trae token después', async () => {
    const { ctx } = contextWith({ authorization: 'Bearer    ' });
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('rechaza (401) sin tocar la DB si el header viene como array (duplicado)', async () => {
    const { ctx } = contextWith({
      authorization: [`Bearer ${validToken}`, `Bearer ${validToken}`],
    });
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('rechaza (401) si el token es válido pero la sesión no existe', async () => {
    findUnique.mockResolvedValue(null);
    const { ctx } = contextWith({ authorization: `Bearer ${validToken}` });
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
    expect(findUnique).toHaveBeenCalledWith({
      where: { tokenHash: hashSessionToken(validToken) },
      include: { person: { include: { tenant: true } } },
    });
  });

  it('rechaza (401) si la sesión está expirada', async () => {
    findUnique.mockResolvedValue(
      buildSession({ expiresAt: new Date(Date.now() - 1000) }),
    );
    const { ctx } = contextWith({ authorization: `Bearer ${validToken}` });
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('rechaza (401) si la persona está inactiva', async () => {
    findUnique.mockResolvedValue(buildSession({ personActive: false }));
    const { ctx } = contextWith({ authorization: `Bearer ${validToken}` });
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('rechaza (401) si el tenant está inactivo', async () => {
    findUnique.mockResolvedValue(buildSession({ tenantActive: false }));
    const { ctx } = contextWith({ authorization: `Bearer ${validToken}` });
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('permite el acceso con una sesión válida y adjunta person/session', async () => {
    const session = buildSession();
    findUnique.mockResolvedValue(session);
    const { ctx, request } = contextWith({
      authorization: `Bearer ${validToken}`,
    });

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(request.person).toBe(session.person);
    expect(request.session).toBe(session);
    expect(request.person.tenantId).toBe('tenant-1');
  });
});
