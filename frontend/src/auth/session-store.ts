/**
 * Unica fuente de verdad para leer/escribir/borrar la sesion del usuario en
 * el cliente. Ningun otro modulo del frontend debe acceder a sessionStorage
 * directamente: todo pasa por getSession/setSession/clearSession.
 *
 * Se usa sessionStorage (no localStorage, no cookies) por decision de
 * seguridad documentada en specs/A2-frontend-base/plan.md: sobrevive al
 * reload de la pestana (AC-16) pero se borra al cerrarla, acotando la
 * ventana de exposicion del token ante XSS.
 */

export type Role = 'OWNER' | 'AGENT';

export interface Session {
  token: string;
  role: Role;
  tenantId: string;
  email: string;
}

const SESSION_STORAGE_KEY = 'agente-inmo:session';

function isSession(value: unknown): value is Session {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.token === 'string' &&
    typeof candidate.role === 'string' &&
    typeof candidate.tenantId === 'string' &&
    typeof candidate.email === 'string'
  );
}

/**
 * Devuelve la sesion persistida o null si no hay ninguna, o si el contenido
 * almacenado esta corrupto / no tiene el shape esperado.
 */
export function getSession(): Session | null {
  const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
  if (raw === null) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    return isSession(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Persiste la sesion completa, reemplazando cualquier sesion previa. */
export function setSession(session: Session): void {
  sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
}

/** Borra la sesion persistida, si existe. */
export function clearSession(): void {
  sessionStorage.removeItem(SESSION_STORAGE_KEY);
}
