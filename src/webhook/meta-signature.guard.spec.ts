import { createHmac } from 'node:crypto';
import { UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { EnvConfig } from '../config/env.schema';
import { MetaSignatureGuard } from './meta-signature.guard';

describe('MetaSignatureGuard', () => {
  const appSecret = 'test-meta-app-secret';

  function contextWith(
    rawBody: Buffer | undefined,
    signature: string | undefined,
  ): ExecutionContext {
    const request = { headers: { 'x-hub-signature-256': signature }, rawBody };
    return {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
  }

  function buildGuard() {
    const config = {
      get: jest.fn().mockReturnValue(appSecret),
    } as unknown as ConfigService<EnvConfig, true>;
    return new MetaSignatureGuard(config);
  }

  function sign(body: Buffer): string {
    return `sha256=${createHmac('sha256', appSecret).update(body).digest('hex')}`;
  }

  it('acepta una firma válida calculada sobre el rawBody', () => {
    const rawBody = Buffer.from(JSON.stringify({ hello: 'world' }));
    const guard = buildGuard();

    expect(guard.canActivate(contextWith(rawBody, sign(rawBody)))).toBe(true);
  });

  it('rechaza cuando falta el header de firma', () => {
    const rawBody = Buffer.from('{}');
    const guard = buildGuard();

    expect(() => guard.canActivate(contextWith(rawBody, undefined))).toThrow(
      UnauthorizedException,
    );
  });

  it('rechaza cuando falta el rawBody', () => {
    const guard = buildGuard();

    expect(() =>
      guard.canActivate(contextWith(undefined, 'sha256=deadbeef')),
    ).toThrow(UnauthorizedException);
  });

  it('rechaza una firma que no matchea el body', () => {
    const rawBody = Buffer.from(JSON.stringify({ hello: 'world' }));
    const tamperedBody = Buffer.from(JSON.stringify({ hello: 'mundo' }));
    const guard = buildGuard();

    expect(() =>
      guard.canActivate(contextWith(tamperedBody, sign(rawBody))),
    ).toThrow(UnauthorizedException);
  });

  it('rechaza una firma calculada con otro secreto', () => {
    const rawBody = Buffer.from(JSON.stringify({ hello: 'world' }));
    const wrongSignature = `sha256=${createHmac('sha256', 'otro-secreto').update(rawBody).digest('hex')}`;
    const guard = buildGuard();

    expect(() =>
      guard.canActivate(contextWith(rawBody, wrongSignature)),
    ).toThrow(UnauthorizedException);
  });
});
