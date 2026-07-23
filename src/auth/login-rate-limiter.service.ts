import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../common/redis.module';
import type { EnvConfig } from '../config/env.schema';

/**
 * Rate limiter de login por email, respaldado en Redis (AC-11).
 *
 * Cuenta SOLO intentos fallidos: el contador se incrementa en cada fallo y solo
 * se limpia con un `reset()` explícito (login exitoso). Por eso NO se reusa
 * `ThrottlerGuard`/`TenantThrottlerGuard`, que incrementan en TODA request
 * (sin distinguir éxito de fallo) y trackean por IP/tenant, no por email.
 *
 * Clave: `login:fail:<emailNormalizado>` (email en minúsculas). El TTL de la
 * ventana se setea UNA sola vez —en el primer fallo— para que los 15 minutos
 * corran desde ese primer fallo y no se reseteen con cada intento posterior
 * (si se reseteara, un atacante que sigue probando mantendría la ventana viva
 * indefinidamente y el bloqueo nunca vencería).
 */
@Injectable()
export class LoginRateLimiterService {
  private readonly maxFailedAttempts: number;
  private readonly windowSeconds: number;

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    config: ConfigService<EnvConfig, true>,
  ) {
    this.maxFailedAttempts = config.get('LOGIN_MAX_FAILED_ATTEMPTS', {
      infer: true,
    });
    this.windowSeconds =
      config.get('LOGIN_WINDOW_MINUTES', { infer: true }) * 60;
  }

  /**
   * Lanza 429 si el email ya acumuló `LOGIN_MAX_FAILED_ATTEMPTS` fallos dentro
   * de la ventana. Se llama ANTES de verificar credenciales, así el intento que
   * excede el límite se rechaza incluso con contraseña correcta.
   */
  async assertNotBlocked(email: string): Promise<void> {
    const raw = await this.redis.get(this.failKey(email));
    const failures = raw === null ? 0 : Number.parseInt(raw, 10);

    if (Number.isFinite(failures) && failures >= this.maxFailedAttempts) {
      throw new HttpException(
        'Demasiados intentos de login fallidos. Probá de nuevo más tarde.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  /**
   * Registra un fallo. `INCR` es atómico; el `EXPIRE` de la ventana se aplica
   * solo cuando el contador pasa a 1 (primer fallo), para anclar la ventana al
   * primer fallo y no reiniciarla en cada intento.
   */
  async registerFailure(email: string): Promise<void> {
    const key = this.failKey(email);
    const failures = await this.redis.incr(key);

    if (failures === 1) {
      await this.redis.expire(key, this.windowSeconds);
    }
  }

  /** Limpia el contador de fallos (login exitoso). */
  async reset(email: string): Promise<void> {
    await this.redis.del(this.failKey(email));
  }

  private failKey(email: string): string {
    return `login:fail:${this.normalizeEmail(email)}`;
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }
}
