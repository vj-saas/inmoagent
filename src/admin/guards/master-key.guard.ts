import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import type { EnvConfig } from '../../config/env.schema';

/** Autentica operaciones de plataforma (ej: alta de tenants) vía header `X-Master-Key`. */
@Injectable()
export class MasterKeyGuard implements CanActivate {
  constructor(private readonly config: ConfigService<EnvConfig, true>) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const provided = request.headers['x-master-key'];
    const expected = this.config.get('ADMIN_MASTER_KEY', { infer: true });

    if (
      typeof provided !== 'string' ||
      !provided ||
      !this.safeEqual(provided, expected)
    ) {
      throw new UnauthorizedException('Master key inválida');
    }
    return true;
  }

  private safeEqual(a: string, b: string): boolean {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) {
      return false;
    }
    return timingSafeEqual(bufA, bufB);
  }
}
