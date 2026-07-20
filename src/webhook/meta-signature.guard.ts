import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  type RawBodyRequest,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import type { EnvConfig } from '../config/env.schema';

const SIGNATURE_HEADER = 'x-hub-signature-256';
const SIGNATURE_PREFIX = 'sha256=';

/**
 * Valida `X-Hub-Signature-256` (HMAC SHA-256 con META_APP_SECRET) sobre el
 * body crudo del webhook. Requiere que la app se haya creado con `rawBody: true`.
 */
@Injectable()
export class MetaSignatureGuard implements CanActivate {
  private readonly logger = new Logger(MetaSignatureGuard.name);

  constructor(private readonly config: ConfigService<EnvConfig, true>) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<RawBodyRequest<Request>>();
    const signatureHeader = request.headers[SIGNATURE_HEADER];
    const rawBody = request.rawBody;

    if (
      typeof signatureHeader !== 'string' ||
      !signatureHeader.startsWith(SIGNATURE_PREFIX) ||
      !rawBody
    ) {
      this.logger.warn(
        'Webhook de Meta rechazado: falta X-Hub-Signature-256 o el rawBody',
      );
      throw new UnauthorizedException('Firma inválida');
    }

    const appSecret = this.config.get('META_APP_SECRET', { infer: true });
    const expectedHex = createHmac('sha256', appSecret)
      .update(rawBody)
      .digest('hex');
    const receivedHex = signatureHeader.slice(SIGNATURE_PREFIX.length);

    const expected = Buffer.from(expectedHex, 'hex');
    const received = Buffer.from(receivedHex, 'hex');

    if (
      expected.length !== received.length ||
      !timingSafeEqual(expected, received)
    ) {
      this.logger.warn('Webhook de Meta rechazado: firma inválida');
      throw new UnauthorizedException('Firma inválida');
    }

    return true;
  }
}
