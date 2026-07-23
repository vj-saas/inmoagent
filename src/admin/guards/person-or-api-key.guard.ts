import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { PersonSessionGuard } from '../../auth/guards/person-session.guard';
import { TenantScopeGuard } from '../../auth/guards/tenant-scope.guard';
import { TenantApiKeyGuard } from './tenant-api-key.guard';

const BEARER_PREFIX = 'Bearer ';
const NO_CREDENTIALS_ERROR =
  'Se requiere una API key de tenant o una sesión de persona';

/**
 * Guard compuesto con semántica OR para los endpoints admin scopeados a un
 * tenant (`leads`, `metrics`, `properties`). Enruta por header, con precedencia
 * determinista (API key primero, por ser el camino legado):
 *
 * - `X-Api-Key` presente  → delega en {@link TenantApiKeyGuard} (server-to-server,
 *   camino intacto — AC-18).
 * - `Authorization: Bearer` presente → delega en {@link PersonSessionGuard} y
 *   LUEGO en {@link TenantScopeGuard} (verifica `person.tenantId === :tenantId`
 *   de la ruta; si no coincide, 403 — AC-19).
 * - ninguno de los dos → 401.
 *
 * No prueba ambos caminos ni filtra sus errores: un 403 de scope de la rama de
 * sesión se deja propagar tal cual, nunca se enmascara como 401. Reusa los tres
 * guards por inyección; no reimplementa su lógica.
 */
@Injectable()
export class PersonOrApiKeyGuard implements CanActivate {
  constructor(
    private readonly tenantApiKeyGuard: TenantApiKeyGuard,
    private readonly personSessionGuard: PersonSessionGuard,
    private readonly tenantScopeGuard: TenantScopeGuard,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();

    // Precedencia determinista: primero API key (camino legado), luego sesión.
    if (this.hasApiKey(request)) {
      return this.tenantApiKeyGuard.canActivate(context) as Promise<boolean>;
    }

    if (this.hasBearer(request)) {
      // Encadenado, no en paralelo: si PersonSessionGuard pasa pero
      // TenantScopeGuard rechaza (403), esa excepción se propaga sin
      // convertirse en un 401 genérico.
      await this.personSessionGuard.canActivate(context);
      return this.tenantScopeGuard.canActivate(context) as boolean;
    }

    throw new UnauthorizedException(NO_CREDENTIALS_ERROR);
  }

  /** `true` si viene un header `X-Api-Key` no vacío. */
  private hasApiKey(request: Request): boolean {
    const apiKey = request.headers['x-api-key'];
    return typeof apiKey === 'string' && apiKey.length > 0;
  }

  /** `true` si viene un header `Authorization` con prefijo `Bearer `. */
  private hasBearer(request: Request): boolean {
    const header = request.headers['authorization'];
    return typeof header === 'string' && header.startsWith(BEARER_PREFIX);
  }
}
