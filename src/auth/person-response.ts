import type { Person, PersonRole } from '@prisma/client';

/**
 * Forma saneada de una persona para respuestas HTTP. NO incluye `passwordHash`
 * (ni ningún otro secreto): el campo directamente no existe en el tipo, así que
 * una regresión que intentara filtrarlo no compilaría.
 */
export interface PersonResponse {
  id: string;
  tenantId: string;
  email: string;
  role: PersonRole;
  active: boolean;
}

/**
 * Mapea una entidad `Person` de Prisma a su respuesta pública. Construye un
 * objeto con whitelist explícita de campos (nunca un spread de la entidad) para
 * que sea imposible que se cuele `passwordHash` aunque el objeto de origen lo
 * traiga (AC-3).
 */
export function toPersonResponse(person: Person): PersonResponse {
  return {
    id: person.id,
    tenantId: person.tenantId,
    email: person.email,
    role: person.role,
    active: person.active,
  };
}
