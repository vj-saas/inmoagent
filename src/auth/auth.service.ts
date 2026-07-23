import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvConfig } from '../config/env.schema';
import { PrismaService } from '../prisma/prisma.service';
import { LoginRateLimiterService } from './login-rate-limiter.service';
import { verifyPassword } from './password.util';
import {
  generateSessionToken,
  hashSessionToken,
} from './session-token.util';

/**
 * Mensaje ÚNICO para todo fallo de login (email inexistente, password
 * incorrecta, persona inactiva o tenant inactivo). No revela cuál de las
 * condiciones ocurrió: es la defensa anti-enumeración a nivel de mensaje
 * (AC-9/AC-10).
 */
const INVALID_CREDENTIALS_MESSAGE = 'Credenciales inválidas';

/**
 * Hash argon2 FIJO de una contraseña arbitraria, precalculado con los mismos
 * parámetros por defecto que produce `hashPassword` (`m=65536,t=3,p=4`). Su
 * único propósito es igualar el timing: cuando el email no existe se corre un
 * `argon2.verify` contra este hash (que siempre da `false`) para que la
 * respuesta tarde lo mismo que un login contra una persona real. Sin esto, un
 * atacante podría inferir qué emails existen midiendo la latencia. No es un
 * secreto: es el hash de una contraseña descartable, nunca se usa para
 * autenticar a nadie.
 */
const DUMMY_PASSWORD_HASH =
  '$argon2id$v=19$m=65536,t=3,p=4$XhEYMNCc6kbrLuvQGutTGQ$U8nynmt2tcLiaBXrWO1LAuX3+BePnyVSXswjC3ITKz0';

/**
 * Servicio de autenticación de personas: login (emisión de sesión) y logout
 * (revocación). El flujo está diseñado para ser indistinguible en tiempo y en
 * mensaje entre las distintas causas de fallo (anti-enumeración), y para nunca
 * exponer ni loguear secretos (token en claro, `passwordHash`).
 */
@Injectable()
export class AuthService {
  private readonly sessionTtlMs: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly loginRateLimiter: LoginRateLimiterService,
    config: ConfigService<EnvConfig, true>,
  ) {
    this.sessionTtlMs =
      config.get('SESSION_TTL_HOURS', { infer: true }) * 3600 * 1000;
  }

  /**
   * Autentica una persona y emite una sesión. Devuelve el token EN CLARO (una
   * sola vez); en DB solo se persiste su `tokenHash`. Cualquier fallo responde
   * 401 con el mismo mensaje genérico y registra el intento en el rate-limiter.
   */
  async login(email: string, password: string): Promise<{ token: string }> {
    const normalizedEmail = email.trim().toLowerCase();

    // 429 si el email ya superó el máximo de fallos. ANTES de tocar la DB, así
    // el bloqueo aplica incluso con credenciales correctas. No se atrapa: 429
    // debe propagar como tal (distinto de 401 de credenciales) — AC-11.
    await this.loginRateLimiter.assertNotBlocked(normalizedEmail);

    const person = await this.prisma.person.findUnique({
      where: { email: normalizedEmail },
      include: { tenant: true },
    });

    // En TODOS los caminos corre exactamente un `argon2.verify`: contra el hash
    // real si la persona existe, o contra el hash dummy fijo si no, para que el
    // tiempo de respuesta no delate la existencia del email (anti-enumeración).
    const passwordMatches = person
      ? await verifyPassword(person.passwordHash, password)
      : await verifyPassword(DUMMY_PASSWORD_HASH, password);

    const authenticated =
      person !== null &&
      passwordMatches &&
      person.active &&
      person.tenant.active;

    if (!authenticated) {
      await this.loginRateLimiter.registerFailure(normalizedEmail);
      throw new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE);
    }

    // Login exitoso: se limpia el contador de fallos y se emite la sesión.
    await this.loginRateLimiter.reset(normalizedEmail);

    const { token, tokenHash } = generateSessionToken();
    await this.prisma.session.create({
      data: {
        tokenHash,
        personId: person.id,
        expiresAt: new Date(Date.now() + this.sessionTtlMs),
      },
    });

    return { token };
  }

  /**
   * Cierra una sesión: borra la `Session` cuyo `tokenHash` coincide con el del
   * token recibido. Idempotente — si el token no corresponde a ninguna sesión
   * (ya cerrada, inválida) no lanza. El token en claro nunca se persiste ni se
   * loguea; solo se calcula su hash para el lookup.
   */
  async logout(token: string): Promise<void> {
    await this.prisma.session.deleteMany({
      where: { tokenHash: hashSessionToken(token) },
    });
  }
}
