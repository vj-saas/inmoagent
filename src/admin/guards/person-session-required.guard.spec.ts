import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import type { AuthenticatedPersonRequest } from '../../auth/authenticated-person-request';
import { PersonSessionRequiredGuard } from './person-session-required.guard';

function contextWith(
  request: Partial<AuthenticatedPersonRequest>,
): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('PersonSessionRequiredGuard', () => {
  let guard: PersonSessionRequiredGuard;

  beforeEach(() => {
    guard = new PersonSessionRequiredGuard();
  });

  // AC-5: request autenticado solo por la rama API key de PersonOrApiKeyGuard
  // (sin `person` adjunta) -> 403, no 401.
  it('sin request.person lanza ForbiddenException (403)', () => {
    const ctx = contextWith({});

    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('con request.person seteada deja pasar', () => {
    const ctx = contextWith({
      person: { id: 'person-1' } as AuthenticatedPersonRequest['person'],
    });

    expect(guard.canActivate(ctx)).toBe(true);
  });

  // Precedencia real de PersonOrApiKeyGuard: con X-Api-Key Y Authorization: Bearer
  // a la vez, gana la rama API key (ver person-or-api-key.guard.ts,
  // "con X-Api-Key y Bearer a la vez, evalúa primero X-Api-Key"). Esa rama
  // nunca adjunta `person`, así que este guard marcador ve `request.person`
  // ausente y responde 403 aunque el Bearer sea válido.
  it('con ambos headers presentes pero sin person adjunta (precedencia API key) responde 403', () => {
    const request = {
      headers: {
        'x-api-key': 'una-key',
        authorization: 'Bearer token-valido',
      },
      // PersonOrApiKeyGuard, al ver x-api-key, delega en TenantApiKeyGuard
      // y nunca ejecuta PersonSessionGuard: person queda sin setear.
    };
    const ctx = contextWith(request as Partial<AuthenticatedPersonRequest>);

    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });
});
