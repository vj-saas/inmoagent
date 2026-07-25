import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedPersonRequest } from '../../auth/authenticated-person-request';

const PERSON_SESSION_REQUIRED_ERROR =
  'Este endpoint requiere una sesión de persona';

/**
 * Guard marcador a nivel método, encadenado DESPUÉS del guard de clase
 * `PersonOrApiKeyGuard`. No re-autentica (sin queries): solo verifica que
 * `request.person` ya haya sido adjuntada por la rama de sesión de ese guard
 * compuesto. Si el request llegó autenticado por la rama API key,
 * `request.person` nunca se setea → 403.
 *
 * Se usa (no re-implementa) para distinguir "autenticado pero no como
 * persona" (403) de "no autenticado" (401, que ya resuelve `PersonOrApiKeyGuard`).
 */
@Injectable()
export class PersonSessionRequiredGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<Request & Partial<AuthenticatedPersonRequest>>();

    if (!request.person) {
      throw new ForbiddenException(PERSON_SESSION_REQUIRED_ERROR);
    }

    return true;
  }
}
