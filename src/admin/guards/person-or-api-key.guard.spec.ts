import {
  ForbiddenException,
  UnauthorizedException,
  type ExecutionContext,
} from '@nestjs/common';
import type { PersonSessionGuard } from '../../auth/guards/person-session.guard';
import type { TenantScopeGuard } from '../../auth/guards/tenant-scope.guard';
import type { TenantApiKeyGuard } from './tenant-api-key.guard';
import { PersonOrApiKeyGuard } from './person-or-api-key.guard';

function contextWith(
  headers: Record<string, string>,
  params: Record<string, string> = { tenantId: 'tenant-1' },
): ExecutionContext {
  const request = { headers, params };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('PersonOrApiKeyGuard', () => {
  let apiKeyGuard: { canActivate: jest.Mock };
  let sessionGuard: { canActivate: jest.Mock };
  let scopeGuard: { canActivate: jest.Mock };
  let guard: PersonOrApiKeyGuard;

  beforeEach(() => {
    apiKeyGuard = { canActivate: jest.fn().mockResolvedValue(true) };
    sessionGuard = { canActivate: jest.fn().mockResolvedValue(true) };
    scopeGuard = { canActivate: jest.fn().mockReturnValue(true) };
    guard = new PersonOrApiKeyGuard(
      apiKeyGuard as unknown as TenantApiKeyGuard,
      sessionGuard as unknown as PersonSessionGuard,
      scopeGuard as unknown as TenantScopeGuard,
    );
  });

  // AC-18: camino API key intacto.
  it('con X-Api-Key delega en TenantApiKeyGuard y no toca los guards de sesión', async () => {
    const ctx = contextWith({ 'x-api-key': 'una-key' });

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(apiKeyGuard.canActivate).toHaveBeenCalledWith(ctx);
    expect(sessionGuard.canActivate).not.toHaveBeenCalled();
    expect(scopeGuard.canActivate).not.toHaveBeenCalled();
  });

  it('propaga el rechazo de TenantApiKeyGuard (API key inválida → 401)', async () => {
    apiKeyGuard.canActivate.mockRejectedValue(new UnauthorizedException());
    const ctx = contextWith({ 'x-api-key': 'key-mala' });

    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  // AC-17: sesión válida del tenant correcto autoriza.
  it('con Bearer y sesión válida del tenant correcto encadena sesión + scope', async () => {
    const ctx = contextWith({ authorization: 'Bearer token-valido' });

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(sessionGuard.canActivate).toHaveBeenCalledWith(ctx);
    expect(scopeGuard.canActivate).toHaveBeenCalledWith(ctx);
    expect(apiKeyGuard.canActivate).not.toHaveBeenCalled();
  });

  // AC-19: sesión válida pero tenant equivocado → 403, sin enmascarar como 401.
  it('deja propagar el 403 de TenantScopeGuard (cross-tenant), no lo convierte en 401', async () => {
    scopeGuard.canActivate.mockImplementation(() => {
      throw new ForbiddenException();
    });
    const ctx = contextWith({ authorization: 'Bearer token-de-otro-tenant' });

    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
    expect(sessionGuard.canActivate).toHaveBeenCalledWith(ctx);
  });

  it('no ejecuta TenantScopeGuard si PersonSessionGuard rechaza (401)', async () => {
    sessionGuard.canActivate.mockRejectedValue(new UnauthorizedException());
    const ctx = contextWith({ authorization: 'Bearer token-invalido' });

    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
    expect(scopeGuard.canActivate).not.toHaveBeenCalled();
  });

  // Precedencia determinista: con ambos headers, gana X-Api-Key.
  it('con X-Api-Key y Bearer a la vez, evalúa primero X-Api-Key', async () => {
    const ctx = contextWith({
      'x-api-key': 'una-key',
      authorization: 'Bearer token-valido',
    });

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(apiKeyGuard.canActivate).toHaveBeenCalledWith(ctx);
    expect(sessionGuard.canActivate).not.toHaveBeenCalled();
  });

  // Sin ningún header de credencial → 401 genérico.
  it('sin X-Api-Key ni Bearer responde 401', async () => {
    const ctx = contextWith({});

    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
    expect(apiKeyGuard.canActivate).not.toHaveBeenCalled();
    expect(sessionGuard.canActivate).not.toHaveBeenCalled();
  });

  it('trata un X-Api-Key vacío como ausente (cae a 401 si no hay Bearer)', async () => {
    const ctx = contextWith({ 'x-api-key': '' });

    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
    expect(apiKeyGuard.canActivate).not.toHaveBeenCalled();
  });

  it('ignora un Authorization sin prefijo Bearer → 401', async () => {
    const ctx = contextWith({ authorization: 'Basic dXNlcjpwYXNz' });

    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
    expect(sessionGuard.canActivate).not.toHaveBeenCalled();
  });
});
