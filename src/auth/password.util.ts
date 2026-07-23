import * as argon2 from 'argon2';
import { randomBytes } from 'node:crypto';

// Charset alfanumérico (62 símbolos) para contraseñas temporales legibles.
const ALPHANUMERIC =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

// Longitud por defecto de la contraseña temporal: cómoda de transcribir y muy
// por encima del @MinLength(8) que valida cualquier DTO de personas.
const TEMPORARY_PASSWORD_LENGTH = 16;

/**
 * Hashea una contraseña de persona con argon2, mismo patrón que `apiKeyHash` de
 * tenants (`tenants-admin.service.ts`): opciones por defecto de argon2, sin
 * parametrizar. argon2 (lento, con salt propio) es lo adecuado para secretos de
 * baja entropía como una contraseña; los tokens de sesión, en cambio, van con
 * sha256 (ver `session-token.util.ts`).
 */
export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password);
}

/**
 * Verifica una contraseña contra su hash argon2. Un hash corrupto o de otro
 * formato hace que `argon2.verify` lance: lo tratamos como "no coincide"
 * (mismo criterio defensivo que `TenantApiKeyGuard`), nunca como un 500.
 */
export function verifyPassword(hash: string, password: string): Promise<boolean> {
  return argon2.verify(hash, password).catch(() => false);
}

/**
 * Genera una contraseña temporal alfanumérica de alta entropía (16 chars,
 * charset de 62 símbolos). Usa rejection sampling sobre `randomBytes` para
 * evitar el sesgo de módulo (256 no es múltiplo de 62), de modo que ningún
 * carácter quede sobre-representado. Se devuelve una única vez al caller y
 * nunca se persiste ni se loguea en claro.
 */
export function generateTemporaryPassword(
  length: number = TEMPORARY_PASSWORD_LENGTH,
): string {
  // Mayor múltiplo de 62 que entra en un byte (248): descartamos 248..255 para
  // que la distribución sobre el charset sea uniforme.
  const unbiasedMax =
    Math.floor(256 / ALPHANUMERIC.length) * ALPHANUMERIC.length;

  let result = '';
  while (result.length < length) {
    const bytes = randomBytes(length - result.length);
    for (const byte of bytes) {
      if (byte < unbiasedMax) {
        result += ALPHANUMERIC[byte % ALPHANUMERIC.length];
        if (result.length === length) {
          break;
        }
      }
    }
  }
  return result;
}
