import { UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { EnvConfig } from '../../config/env.schema';
import { MasterKeyGuard } from './master-key.guard';

function contextWith(headers: Record<string, string>): ExecutionContext {
  const request = { headers };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('MasterKeyGuard', () => {
  const realMasterKey = 'master-secret-key';

  function buildGuard() {
    const config = {
      get: jest.fn().mockReturnValue(realMasterKey),
    } as unknown as ConfigService<EnvConfig, true>;
    return new MasterKeyGuard(config);
  }

  it('permite el acceso con la master key correcta', () => {
    const guard = buildGuard();
    expect(
      guard.canActivate(contextWith({ 'x-master-key': realMasterKey })),
    ).toBe(true);
  });

  it('rechaza si falta el header', () => {
    const guard = buildGuard();
    expect(() => guard.canActivate(contextWith({}))).toThrow(
      UnauthorizedException,
    );
  });

  it('rechaza una master key incorrecta', () => {
    const guard = buildGuard();
    expect(() =>
      guard.canActivate(contextWith({ 'x-master-key': 'incorrecta' })),
    ).toThrow(UnauthorizedException);
  });

  it('rechaza una master key de distinta longitud sin lanzar por el timingSafeEqual', () => {
    const guard = buildGuard();
    expect(() =>
      guard.canActivate(contextWith({ 'x-master-key': 'corta' })),
    ).toThrow(UnauthorizedException);
  });
});
