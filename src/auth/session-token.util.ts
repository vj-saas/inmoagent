import { createHash, randomBytes } from 'node:crypto';

// 32 bytes = 256 bits de entropía para el token opaco de sesión.
const SESSION_TOKEN_BYTES = 32;

export interface GeneratedSessionToken {
  /** Token opaco en claro: se devuelve al cliente y NUNCA se persiste. */
  token: string;
  /** sha256(token) en hex: lo ÚNICO que se guarda en `Session.tokenHash`. */
  tokenHash: string;
}

/**
 * Calcula el `sha256` (hex) de un token de sesión. Es determinístico e
 * indexable, por eso el `PersonSessionGuard` puede buscar la sesión por
 * `tokenHash` en O(1) contra el índice único. Se usa tanto al emitir la sesión
 * como al resolver el `Authorization: Bearer <token>` de cada request.
 */
export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Genera un token de sesión opaco de 256 bits y su hash sha256. El token en
 * claro viaja al cliente una sola vez; en DB se guarda solo el hash, de modo
 * que una fuga de la tabla `Session` no expone tokens usables.
 */
export function generateSessionToken(): GeneratedSessionToken {
  const token = randomBytes(SESSION_TOKEN_BYTES).toString('hex');
  return { token, tokenHash: hashSessionToken(token) };
}
