import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as argon2 from 'argon2';
import type { PrismaService } from '../prisma/prisma.service';
import { PeopleService } from './people.service';

/**
 * Unit de `PeopleService` con `PrismaService` mockeado. La `$transaction`
 * interactiva se simula ejecutando el callback con un cliente `tx` que expone
 * los mismos mocks que el cliente principal, de modo que se pueda espiar tanto
 * las operaciones dentro como fuera de la transacción. Los tests que verifican
 * el hash usan argon2 real (mismo criterio que `tenants-admin.service.spec`).
 */

interface PersonRow {
  id: string;
  tenantId: string;
  email: string;
  passwordHash: string;
  role: 'OWNER' | 'AGENT';
  active: boolean;
}

function personRow(overrides: Partial<PersonRow> = {}): PersonRow {
  return {
    id: 'person-1',
    tenantId: 'tenant-1',
    email: 'persona@ejemplo.com',
    passwordHash: 'hash-previo',
    role: 'AGENT',
    active: true,
    ...overrides,
  };
}

function build() {
  const personFindFirst = jest.fn();
  const personFindMany = jest.fn();
  const personCreate = jest.fn();
  const personUpdate = jest.fn();
  const personCount = jest.fn();
  const sessionDeleteMany = jest.fn().mockResolvedValue({ count: 0 });

  const tx = {
    person: {
      findFirst: personFindFirst,
      create: personCreate,
      update: personUpdate,
      count: personCount,
    },
    session: { deleteMany: sessionDeleteMany },
  };

  const prisma = {
    person: { create: personCreate, findMany: personFindMany, findFirst: personFindFirst },
    $transaction: jest.fn((cb: (client: typeof tx) => unknown) => cb(tx)),
  } as unknown as PrismaService;

  const service = new PeopleService(prisma);
  return {
    service,
    prisma,
    personFindFirst,
    personFindMany,
    personCreate,
    personUpdate,
    personCount,
    sessionDeleteMany,
  };
}

describe('PeopleService', () => {
  describe('bootstrapOwner', () => {
    it('crea el primer OWNER activo del tenant cuando no hay ninguno, sin exponer el hash', async () => {
      const { service, personFindFirst, personCreate } = build();
      personFindFirst.mockResolvedValue(null);
      personCreate.mockImplementation((args: { data: PersonRow }) =>
        Promise.resolve(personRow({ ...args.data, id: 'owner-1' })),
      );

      const result = await service.bootstrapOwner('tenant-1', {
        email: 'Owner@Ejemplo.com',
        password: 'password123',
      });

      expect(result).toEqual({
        id: 'owner-1',
        tenantId: 'tenant-1',
        email: 'owner@ejemplo.com',
        role: 'OWNER',
        active: true,
      });
      expect(result).not.toHaveProperty('passwordHash');

      const createArgs = personCreate.mock.calls[0][0] as { data: PersonRow };
      expect(createArgs.data.role).toBe('OWNER');
      expect(createArgs.data.active).toBe(true);
      expect(createArgs.data.tenantId).toBe('tenant-1');
      expect(createArgs.data.email).toBe('owner@ejemplo.com');
      await expect(
        argon2.verify(createArgs.data.passwordHash, 'password123'),
      ).resolves.toBe(true);
    });

    it('rechaza con 409 y no crea nada si el tenant ya tiene un owner activo', async () => {
      const { service, personFindFirst, personCreate } = build();
      personFindFirst.mockResolvedValue(personRow({ role: 'OWNER' }));

      await expect(
        service.bootstrapOwner('tenant-1', {
          email: 'otro@ejemplo.com',
          password: 'password123',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(personCreate).not.toHaveBeenCalled();
    });

    it('lanza 404 si el tenant no existe (FK P2003), sin devolver un owner', async () => {
      const { service, personFindFirst, personCreate } = build();
      personFindFirst.mockResolvedValue(null);
      personCreate.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError(
          'Foreign key constraint failed',
          { code: 'P2003', clientVersion: '7.8.0' },
        ),
      );

      await expect(
        service.bootstrapOwner('tenant-inexistente', {
          email: 'owner@ejemplo.com',
          password: 'password123',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('traduce la violación de restricción única (P2002) del índice único parcial a 409', async () => {
      const { service, personFindFirst, personCreate } = build();
      personFindFirst.mockResolvedValue(null);
      personCreate.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError(
          'Unique constraint failed',
          { code: 'P2002', clientVersion: '7.8.0' },
        ),
      );

      await expect(
        service.bootstrapOwner('tenant-1', {
          email: 'owner@ejemplo.com',
          password: 'password123',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('create', () => {
    it('genera y devuelve una contraseña temporal cuando no viene password', async () => {
      const { service, personCreate } = build();
      personCreate.mockImplementation((args: { data: PersonRow }) =>
        Promise.resolve(personRow({ ...args.data, id: 'agent-1' })),
      );

      const result = await service.create('tenant-1', {
        email: 'Nuevo@Ejemplo.com',
        role: 'AGENT',
      });

      expect(result).toHaveProperty('temporaryPassword');
      const temporaryPassword = (
        result as { temporaryPassword: string }
      ).temporaryPassword;
      expect(typeof temporaryPassword).toBe('string');
      expect(temporaryPassword.length).toBeGreaterThan(0);
      expect(result).not.toHaveProperty('passwordHash');
      expect(result.email).toBe('nuevo@ejemplo.com');

      // El hash persistido corresponde a la contraseña temporal devuelta.
      const createArgs = personCreate.mock.calls[0][0] as { data: PersonRow };
      await expect(
        argon2.verify(createArgs.data.passwordHash, temporaryPassword),
      ).resolves.toBe(true);
    });

    it('usa el password explícito y NO devuelve temporaryPassword cuando viene', async () => {
      const { service, personCreate } = build();
      personCreate.mockImplementation((args: { data: PersonRow }) =>
        Promise.resolve(personRow({ ...args.data, id: 'agent-2' })),
      );

      const result = await service.create('tenant-1', {
        email: 'con-pass@ejemplo.com',
        role: 'AGENT',
        password: 'mi-password-explicita',
      });

      expect(result).not.toHaveProperty('temporaryPassword');
      const createArgs = personCreate.mock.calls[0][0] as { data: PersonRow };
      await expect(
        argon2.verify(createArgs.data.passwordHash, 'mi-password-explicita'),
      ).resolves.toBe(true);
    });

    it('rechaza con 409 cuando el email ya existe (P2002), sin crear', async () => {
      const { service, personCreate } = build();
      personCreate.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: '7.8.0',
        }),
      );

      await expect(
        service.create('tenant-1', {
          email: 'duplicado@ejemplo.com',
          role: 'AGENT',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('list', () => {
    it('filtra por tenantId y devuelve respuestas saneadas (sin passwordHash)', async () => {
      const { service, personFindMany } = build();
      personFindMany.mockResolvedValue([
        personRow({ id: 'p1', email: 'a@ejemplo.com' }),
        personRow({ id: 'p2', email: 'b@ejemplo.com', role: 'OWNER' }),
      ]);

      const result = await service.list('tenant-1');

      expect(personFindMany).toHaveBeenCalledWith({
        where: { tenantId: 'tenant-1' },
      });
      expect(result).toEqual([
        {
          id: 'p1',
          tenantId: 'tenant-1',
          email: 'a@ejemplo.com',
          role: 'AGENT',
          active: true,
        },
        {
          id: 'p2',
          tenantId: 'tenant-1',
          email: 'b@ejemplo.com',
          role: 'OWNER',
          active: true,
        },
      ]);
      expect(JSON.stringify(result)).not.toContain('passwordHash');
    });
  });

  describe('deactivate', () => {
    it('desactiva la persona y borra sus sesiones en la misma transacción', async () => {
      const {
        service,
        personFindFirst,
        personUpdate,
        sessionDeleteMany,
      } = build();
      personFindFirst.mockResolvedValue(personRow({ id: 'agent-1' }));
      personUpdate.mockResolvedValue(personRow({ id: 'agent-1', active: false }));

      const result = await service.deactivate('tenant-1', 'agent-1');

      expect(result.active).toBe(false);
      expect(personUpdate).toHaveBeenCalledWith({
        where: { id: 'agent-1' },
        data: { active: false },
      });
      expect(sessionDeleteMany).toHaveBeenCalledWith({
        where: { personId: 'agent-1' },
      });
    });

    it('lanza 404 si la persona no existe o es de otro tenant, sin tocar nada', async () => {
      const { service, personFindFirst, personUpdate, sessionDeleteMany } =
        build();
      personFindFirst.mockResolvedValue(null);

      await expect(
        service.deactivate('tenant-1', 'ajeno'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(personUpdate).not.toHaveBeenCalled();
      expect(sessionDeleteMany).not.toHaveBeenCalled();
    });

    it('rechaza con 409 desactivar al último owner activo, sin cambios', async () => {
      const {
        service,
        personFindFirst,
        personCount,
        personUpdate,
        sessionDeleteMany,
      } = build();
      personFindFirst.mockResolvedValue(
        personRow({ id: 'owner-1', role: 'OWNER', active: true }),
      );
      personCount.mockResolvedValue(1);

      await expect(
        service.deactivate('tenant-1', 'owner-1'),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(personUpdate).not.toHaveBeenCalled();
      expect(sessionDeleteMany).not.toHaveBeenCalled();
    });

    it('permite desactivar un owner si hay otro owner activo', async () => {
      const { service, personFindFirst, personCount, personUpdate } = build();
      personFindFirst.mockResolvedValue(
        personRow({ id: 'owner-1', role: 'OWNER', active: true }),
      );
      personCount.mockResolvedValue(2);
      personUpdate.mockResolvedValue(
        personRow({ id: 'owner-1', role: 'OWNER', active: false }),
      );

      const result = await service.deactivate('tenant-1', 'owner-1');

      expect(result.active).toBe(false);
      expect(personUpdate).toHaveBeenCalled();
    });
  });

  describe('resetPassword', () => {
    it('genera un nuevo hash, borra sesiones y devuelve la temporal una vez', async () => {
      const {
        service,
        personFindFirst,
        personUpdate,
        sessionDeleteMany,
      } = build();
      personFindFirst.mockResolvedValue(personRow({ id: 'agent-1' }));
      personUpdate.mockImplementation((args: { data: { passwordHash: string } }) =>
        Promise.resolve(
          personRow({ id: 'agent-1', passwordHash: args.data.passwordHash }),
        ),
      );

      const result = await service.resetPassword('tenant-1', 'agent-1');

      const temporaryPassword = result.temporaryPassword;
      expect(typeof temporaryPassword).toBe('string');
      expect(temporaryPassword.length).toBeGreaterThan(0);
      expect(result).not.toHaveProperty('passwordHash');

      const updateArgs = personUpdate.mock.calls[0][0] as {
        data: { passwordHash: string };
      };
      await expect(
        argon2.verify(updateArgs.data.passwordHash, temporaryPassword),
      ).resolves.toBe(true);
      expect(sessionDeleteMany).toHaveBeenCalledWith({
        where: { personId: 'agent-1' },
      });
    });

    it('lanza 404 si la persona no existe o es de otro tenant, sin cambios', async () => {
      const { service, personFindFirst, personUpdate, sessionDeleteMany } =
        build();
      personFindFirst.mockResolvedValue(null);

      await expect(
        service.resetPassword('tenant-1', 'ajeno'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(personUpdate).not.toHaveBeenCalled();
      expect(sessionDeleteMany).not.toHaveBeenCalled();
    });
  });
});
