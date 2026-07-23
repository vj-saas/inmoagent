import type { Person, Session, Tenant } from '@prisma/client';
import type { Request } from 'express';

/**
 * Request ya autenticado por `PersonSessionGuard`: la sesión fue validada y el
 * guard adjuntó la `person` (con su `tenant`) y la `session`. Mismo patrón que
 * `AuthenticatedAdminRequest` (`tenant-api-key.guard.ts`), extendiendo el
 * `Request` de Express que usa el resto del proyecto.
 */
export interface AuthenticatedPersonRequest extends Request {
  person: Person & { tenant: Tenant };
  session: Session;
}
