import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { AuthenticatedPersonRequest } from '../authenticated-person-request';

/**
 * Guard de aislamiento multi-tenant a nivel de URL (AC-14/AC-15). Corre DESPUÉS
 * de `PersonSessionGuard` (que ya adjuntó `request.person`). Compara el
 * `:tenantId` de la ruta con el `tenantId` de la sesión autenticada: si no
 * coinciden devuelve 403 SIN ejecutar ninguna consulta ni mutación, ni siquiera
 * tocar la DB. Es la defensa en profundidad por la URL; el filtro por `tenantId`
 * en `PeopleService` es la segunda capa dentro del servicio.
 */
@Injectable()
export class TenantScopeGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<AuthenticatedPersonRequest>();

    const routeTenantId = request.params['tenantId'];

    // Si la ruta no tiene `:tenantId`, este guard no tiene nada que verificar.
    // Lo dejamos pasar: el endpoint en sí decidirá si necesita aislamiento.
    if (!routeTenantId) {
      return true;
    }

    if (request.person.tenantId !== routeTenantId) {
      throw new ForbiddenException(
        'No tenés acceso a los recursos de ese tenant',
      );
    }

    return true;
  }
}
