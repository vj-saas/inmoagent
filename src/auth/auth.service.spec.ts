import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvConfig } from '../config/env.schema';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';
import { LoginRateLimiterService } from './login-rate-limiter.service';
import { hashPassword } from './password.util';
import { hashSessionToken } from './session-token.util';

const SESSION_TTL_HOURS = 12;
const PASSWORD = 'super-secreta-123';

/**
 * Persona de prueba con su `passwordHash` argon2 real, para que
 * `verifyPassword` (que corre argon2 de verdad) matchee con `PASSWORD`.
 */
async function buildPerson(
  overrides: Partial<{ active: boolean; tenantActive: boolean }> = {},
) {
  const { active = true, tenantActive = true } = overrides;
  return {
    id: 'person-1',
    tenantId: 'tenant-1',
    email: 'persona@ejemplo.com',
    passwordHash: await hashPassword(PASSWORD),
    role: 'OWNER' as const,
    active,
    createdAt: new Date(),
    updatedAt: new Date(),
    tenant: { id: 'tenant-1', active: tenantActive },
  };
}

function build() {
  const prisma = {
    person: {
      findUnique: jest.fn(),
    },
    session: {
      create: jest.fn().mockResolvedValue({ id: 'session-1' }),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  } as unknown as PrismaService;

  const rateLimiter = {
    assertNotBlocked: jest.fn().mockResolvedValue(undefined),
    registerFailure: jest.fn().mockResolvedValue(undefined),
    reset: jest.fn().mockResolvedValue(undefined),
  } as unknown as LoginRateLimiterService;

  const config = {
    get: jest.fn((key: keyof EnvConfig) => {
      if (key === 'SESSION_TTL_HOURS') return SESSION_TTL_HOURS;
      throw new Error(`config.get inesperado: ${String(key)}`);
    }),
  } as unknown as ConfigService<EnvConfig, true>;

  const service = new AuthService(prisma, rateLimiter, config);
  return { service, prisma, rateLimiter };
}

describe('AuthService', () => {
  // argon2 es intencionalmente lento (~2-5 s/hash). Cada test que llama a
  // buildPerson() corre un hashPassword() real; el timeout por defecto de
  // Jest (5 s) no alcanza cuando hay varios tests con argon2 en el mismo
  // worker. Se eleva a 30 s para que la suite sea estable sin mockear el
  // hash (hacerlo quitaría cobertura real del flujo de verify).
  jest.setTimeout(30_000);

  describe('login — éxito', () => {
    it('devuelve un token en claro y crea la sesión con su hash y expiración', async () => {
      const { service, prisma, rateLimiter } = build();
      const person = await buildPerson();
      (prisma.person.findUnique as jest.Mock).mockResolvedValue(person);

      const before = Date.now();
      const result = await service.login('persona@ejemplo.com', PASSWORD);
      const after = Date.now();

      expect(result.token).toEqual(expect.any(String));
      expect(result.token.length).toBeGreaterThan(0);

      // Se persiste el HASH del token, nunca el token en claro.
      expect(prisma.session.create).toHaveBeenCalledTimes(1);
      const createArg = (prisma.session.create as jest.Mock).mock.calls[0][0];
      expect(createArg.data.tokenHash).toBe(hashSessionToken(result.token));
      expect(createArg.data.tokenHash).not.toBe(result.token);
      expect(createArg.data.personId).toBe(person.id);

      const expiresAt: Date = createArg.data.expiresAt;
      const ttlMs = SESSION_TTL_HOURS * 3600 * 1000;
      expect(expiresAt.getTime()).toBeGreaterThanOrEqual(before + ttlMs);
      expect(expiresAt.getTime()).toBeLessThanOrEqual(after + ttlMs);

      // reset SOLO en éxito; nunca registerFailure.
      expect(rateLimiter.reset).toHaveBeenCalledWith('persona@ejemplo.com');
      expect(rateLimiter.registerFailure).not.toHaveBeenCalled();
    });

    it('normaliza el email a minúsculas para el lookup, el rate-limiter y el reset', async () => {
      const { service, prisma, rateLimiter } = build();
      (prisma.person.findUnique as jest.Mock).mockResolvedValue(
        await buildPerson(),
      );

      await service.login('  Persona@Ejemplo.COM ', PASSWORD);

      expect(rateLimiter.assertNotBlocked).toHaveBeenCalledWith(
        'persona@ejemplo.com',
      );
      expect(prisma.person.findUnique).toHaveBeenCalledWith({
        where: { email: 'persona@ejemplo.com' },
        include: { tenant: true },
      });
      expect(rateLimiter.reset).toHaveBeenCalledWith('persona@ejemplo.com');
    });
  });

  describe('login — fallos (mismo mensaje genérico, registerFailure, sin sesión)', () => {
    const GENERIC = 'Credenciales inválidas';

    async function expectGenericFailure(
      service: AuthService,
      prisma: PrismaService,
      rateLimiter: LoginRateLimiterService,
    ) {
      await expect(
        service.login('persona@ejemplo.com', PASSWORD),
      ).rejects.toMatchObject({ message: GENERIC });
      expect(rateLimiter.registerFailure).toHaveBeenCalledWith(
        'persona@ejemplo.com',
      );
      expect(rateLimiter.reset).not.toHaveBeenCalled();
      expect(prisma.session.create).not.toHaveBeenCalled();
    }

    it('email inexistente: 401 genérico (indistinguible)', async () => {
      const { service, prisma, rateLimiter } = build();
      (prisma.person.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        service.login('persona@ejemplo.com', PASSWORD),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      await expectGenericFailure(service, prisma, rateLimiter);
    });

    it('password incorrecta: 401 genérico', async () => {
      const { service, prisma, rateLimiter } = build();
      (prisma.person.findUnique as jest.Mock).mockResolvedValue(
        await buildPerson(),
      );

      await expect(
        service.login('persona@ejemplo.com', 'password-equivocada'),
      ).rejects.toMatchObject({ message: GENERIC });
      expect(rateLimiter.registerFailure).toHaveBeenCalledWith(
        'persona@ejemplo.com',
      );
      expect(rateLimiter.reset).not.toHaveBeenCalled();
      expect(prisma.session.create).not.toHaveBeenCalled();
    });

    it('persona inactiva (con password correcta): 401 genérico', async () => {
      const { service, prisma, rateLimiter } = build();
      (prisma.person.findUnique as jest.Mock).mockResolvedValue(
        await buildPerson({ active: false }),
      );

      await expectGenericFailure(service, prisma, rateLimiter);
    });

    it('tenant inactivo (con password correcta): 401 genérico', async () => {
      const { service, prisma, rateLimiter } = build();
      (prisma.person.findUnique as jest.Mock).mockResolvedValue(
        await buildPerson({ tenantActive: false }),
      );

      await expectGenericFailure(service, prisma, rateLimiter);
    });
  });

  describe('login — orden y rate-limit', () => {
    it('llama assertNotBlocked ANTES de tocar la DB', async () => {
      const { service, prisma, rateLimiter } = build();
      const order: string[] = [];
      (rateLimiter.assertNotBlocked as jest.Mock).mockImplementation(() => {
        order.push('assertNotBlocked');
        return Promise.resolve();
      });
      (prisma.person.findUnique as jest.Mock).mockImplementation(() => {
        order.push('findUnique');
        return Promise.resolve(null);
      });

      await expect(
        service.login('persona@ejemplo.com', PASSWORD),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      expect(order[0]).toBe('assertNotBlocked');
      expect(order.indexOf('assertNotBlocked')).toBeLessThan(
        order.indexOf('findUnique'),
      );
    });

    it('si assertNotBlocked lanza (429), propaga sin tocar la DB ni registrar fallo', async () => {
      const { service, prisma, rateLimiter } = build();
      const tooMany = new Error('429');
      (rateLimiter.assertNotBlocked as jest.Mock).mockRejectedValue(tooMany);

      await expect(
        service.login('persona@ejemplo.com', PASSWORD),
      ).rejects.toBe(tooMany);

      expect(prisma.person.findUnique).not.toHaveBeenCalled();
      expect(rateLimiter.registerFailure).not.toHaveBeenCalled();
      expect(prisma.session.create).not.toHaveBeenCalled();
    });
  });

  describe('logout', () => {
    it('borra la sesión cuyo tokenHash corresponde al token recibido', async () => {
      const { service, prisma } = build();
      const token = 'abc123token';

      await service.logout(token);

      expect(prisma.session.deleteMany).toHaveBeenCalledWith({
        where: { tokenHash: hashSessionToken(token) },
      });
    });

    it('es idempotente: no lanza si el token no corresponde a ninguna sesión', async () => {
      const { service, prisma } = build();
      (prisma.session.deleteMany as jest.Mock).mockResolvedValue({ count: 0 });

      await expect(service.logout('token-inexistente')).resolves.toBeUndefined();
    });
  });
});
