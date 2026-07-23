import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { AuthenticatedPersonRequest } from '../authenticated-person-request';

/**
 * Guard de rol: restringe el endpoint a personas con rol `OWNER` (AC-16). Corre
 * DESPUÉS de `PersonSessionGuard` (que ya adjuntó `request.person`). Si la
 * persona es `AGENT` devuelve 403 sin ejecutar ninguna consulta ni mutación.
 * Protege las operaciones de gestión de personas (listar, crear, desactivar,
 * resetear contraseña) que son exclusivas de `OWNER`.
 */
@Injectable()
export class OwnerRoleGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<AuthenticatedPersonRequest>();

    if (request.person.role !== 'OWNER') {
      throw new ForbiddenException('Esta operación requiere rol OWNER');
    }

    return true;
  }
}
