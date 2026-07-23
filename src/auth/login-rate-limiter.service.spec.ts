import { HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type Redis from 'ioredis';
import type { EnvConfig } from '../config/env.schema';
import { LoginRateLimiterService } from './login-rate-limiter.service';

const MAX_FAILED = 10;
const WINDOW_MINUTES = 15;
const WINDOW_SECONDS = WINDOW_MINUTES * 60;

const EMAIL = 'Persona@Ejemplo.com';
const NORMALIZED_KEY = 'login:fail:persona@ejemplo.com';

function build() {
  const redis = {
    get: jest.fn().mockResolvedValue(null),
    incr: jest.fn().mockResolvedValue(1),
    expire: jest.fn().mockResolvedValue(1),
    del: jest.fn().mockResolvedValue(1),
  } as unknown as Redis;

  const config = {
    get: jest.fn((key: keyof EnvConfig) => {
      if (key === 'LOGIN_MAX_FAILED_ATTEMPTS') return MAX_FAILED;
      if (key === 'LOGIN_WINDOW_MINUTES') return WINDOW_MINUTES;
      throw new Error(`config.get inesperado: ${String(key)}`);
    }),
  } as unknown as ConfigService<EnvConfig, true>;

  const service = new LoginRateLimiterService(redis, config);
  return { service, redis };
}

describe('LoginRateLimiterService', () => {
  describe('assertNotBlocked', () => {
    it('no bloquea cuando no hay contador previo (GET null)', async () => {
      const { service, redis } = build();

      await expect(service.assertNotBlocked(EMAIL)).resolves.toBeUndefined();
      expect(redis.get).toHaveBeenCalledWith(NORMALIZED_KEY);
    });

    it('no bloquea con fallos por debajo del máximo', async () => {
      const { service, redis } = build();
      (redis.get as jest.Mock).mockResolvedValueOnce(String(MAX_FAILED - 1));

      await expect(service.assertNotBlocked(EMAIL)).resolves.toBeUndefined();
    });

    it('lanza 429 cuando los fallos igualan el máximo', async () => {
      const { service, redis } = build();
      (redis.get as jest.Mock).mockResolvedValueOnce(String(MAX_FAILED));

      await expect(service.assertNotBlocked(EMAIL)).rejects.toBeInstanceOf(
        HttpException,
      );
    });

    it('el 429 usa HttpStatus.TOO_MANY_REQUESTS', async () => {
      const { service, redis } = build();
      (redis.get as jest.Mock).mockResolvedValue(String(MAX_FAILED));

      try {
        await service.assertNotBlocked(EMAIL);
        fail('debió lanzar');
      } catch (err) {
        expect(err).toBeInstanceOf(HttpException);
        expect((err as HttpException).getStatus()).toBe(
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    });

    it('lanza 429 cuando los fallos superan el máximo', async () => {
      const { service, redis } = build();
      (redis.get as jest.Mock).mockResolvedValueOnce(String(MAX_FAILED + 5));

      await expect(service.assertNotBlocked(EMAIL)).rejects.toBeInstanceOf(
        HttpException,
      );
    });
  });

  describe('registerFailure', () => {
    it('setea EXPIRE con la ventana en segundos SOLO en el primer INCR', async () => {
      const { service, redis } = build();
      (redis.incr as jest.Mock).mockResolvedValueOnce(1);

      await service.registerFailure(EMAIL);

      expect(redis.incr).toHaveBeenCalledWith(NORMALIZED_KEY);
      expect(redis.expire).toHaveBeenCalledTimes(1);
      expect(redis.expire).toHaveBeenCalledWith(
        NORMALIZED_KEY,
        WINDOW_SECONDS,
      );
    });

    it('NO vuelve a setear EXPIRE en incrementos posteriores', async () => {
      const { service, redis } = build();
      (redis.incr as jest.Mock).mockResolvedValueOnce(2);

      await service.registerFailure(EMAIL);

      expect(redis.incr).toHaveBeenCalledWith(NORMALIZED_KEY);
      expect(redis.expire).not.toHaveBeenCalled();
    });
  });

  describe('reset', () => {
    it('hace DEL de la clave normalizada', async () => {
      const { service, redis } = build();

      await service.reset(EMAIL);

      expect(redis.del).toHaveBeenCalledWith(NORMALIZED_KEY);
    });
  });

  it('usa la misma clave normalizada (minúsculas) entre métodos', async () => {
    const { service, redis } = build();

    await service.assertNotBlocked('  MixedCase@Foo.COM ');
    await service.registerFailure('mixedcase@foo.com');
    await service.reset('MIXEDCASE@FOO.COM');

    const expectedKey = 'login:fail:mixedcase@foo.com';
    expect(redis.get).toHaveBeenCalledWith(expectedKey);
    expect(redis.incr).toHaveBeenCalledWith(expectedKey);
    expect(redis.del).toHaveBeenCalledWith(expectedKey);
  });
});
