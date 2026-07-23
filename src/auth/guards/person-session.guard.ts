import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthenticatedPersonRequest } from '../authenticated-person-request';
import { hashSessionToken } from '../session-token.util';

const BEARER_PREFIX = 'Bearer ';
const GENERIC_AUTH_ERROR = 'Sesión inválida';

/**
 * Autentica un request de persona vía `Authorization: Bearer <token>`. Resuelve
 * la sesión por `sha256(token)` (indexado único) e incluye `person.tenant`. Si
 * el header falta o está malformado responde 401 SIN tocar la DB (no carga la
 * base con requests no autenticados). Si la sesión no existe, expiró, o la
 * persona/tenant están inactivos, responde 401 con un mensaje genérico único
 * (anti-enumeración). Solo tras validar todo adjunta `request.person` y
 * `request.session` para el handler. Mismo patrón que `TenantApiKeyGuard`.
 */
@Injectable()
export class PersonSessionGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<AuthenticatedPersonRequest>();

    const token = this.extractBearerToken(request.headers['authorization']);
    if (!token) {
      // Header ausente o malformado: 401 sin tocar la DB.
      throw new UnauthorizedException(GENERIC_AUTH_ERROR);
    }

    const session = await this.prisma.session.findUnique({
      where: { tokenHash: hashSessionToken(token) },
      include: { person: { include: { tenant: true } } },
    });

    if (
      !session ||
      session.expiresAt < new Date() ||
      !session.person.active ||
      !session.person.tenant.active
    ) {
      throw new UnauthorizedException(GENERIC_AUTH_ERROR);
    }

    request.person = session.person;
    request.session = session;
    return true;
  }

  /**
   * Devuelve el token opaco si el header es exactamente `Bearer <token>` con un
   * token no vacío; `null` en cualquier otro caso (ausente, array, prefijo
   * incorrecto, o solo espacios). Nunca toca la DB.
   */
  private extractBearerToken(header: string | string[] | undefined): string | null {
    if (typeof header !== 'string' || !header.startsWith(BEARER_PREFIX)) {
      return null;
    }
    const token = header.slice(BEARER_PREFIX.length).trim();
    return token.length > 0 ? token : null;
  }
}
