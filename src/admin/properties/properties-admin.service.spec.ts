import { ConflictException, NotFoundException } from '@nestjs/common';
import { OperationType, PropertyStatus, type Prisma } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import { PropertiesAdminService } from './properties-admin.service';
import type { UpdatePropertyDto } from './update-property.dto';

const TENANT = 'tenant-1';
const PROPERTY_ID = 'property-1';

/** Mock mínimo de `PrismaService.property` para testear el armado del `where` de `list`. */
function build() {
  const findMany = jest.fn().mockResolvedValue([]);
  const count = jest.fn().mockResolvedValue(0);
  const prisma = {
    property: { findMany, count },
  } as unknown as PrismaService;

  return { service: new PropertiesAdminService(prisma), findMany, count };
}

/**
 * Mock de `PrismaService` para `remove`: `$transaction` interactivo ejecuta el
 * callback con un `tx` que expone `property.findFirst`/`delete` y
 * `appointment.findFirst`.
 */
function buildForRemove(options: {
  property?: unknown;
  appointment?: { id: string } | null;
}) {
  const propertyFindFirst = jest
    .fn()
    .mockResolvedValue(
      'property' in options
        ? options.property
        : { id: PROPERTY_ID, tenantId: TENANT },
    );
  const propertyDelete = jest.fn().mockResolvedValue(undefined);
  const appointmentFindFirst = jest
    .fn()
    .mockResolvedValue(options.appointment ?? null);

  const tx = {
    property: { findFirst: propertyFindFirst, delete: propertyDelete },
    appointment: { findFirst: appointmentFindFirst },
  };

  const prisma = {
    $transaction: jest.fn((cb: (t: typeof tx) => unknown) => cb(tx)),
  } as unknown as PrismaService;

  return {
    service: new PropertiesAdminService(prisma),
    propertyFindFirst,
    propertyDelete,
    appointmentFindFirst,
  };
}

/**
 * Mock de `PrismaService` para `update`: `$transaction` interactivo ejecuta el
 * callback con un `tx` que expone `property.findFirst`/`update` y
 * `propertyPhoto.deleteMany`/`createMany`.
 */
function buildForUpdate(options: { property?: unknown } = {}) {
  const propertyFindFirst = jest
    .fn()
    .mockResolvedValue(
      'property' in options
        ? options.property
        : { id: PROPERTY_ID, tenantId: TENANT },
    );
  const propertyUpdate = jest
    .fn()
    .mockResolvedValue({ id: PROPERTY_ID, tenantId: TENANT });
  const photoDeleteMany = jest.fn().mockResolvedValue({ count: 0 });
  const photoCreateMany = jest.fn().mockResolvedValue({ count: 0 });

  const tx = {
    property: { findFirst: propertyFindFirst, update: propertyUpdate },
    propertyPhoto: {
      deleteMany: photoDeleteMany,
      createMany: photoCreateMany,
    },
  };

  const prisma = {
    $transaction: jest.fn((cb: (t: typeof tx) => unknown) => cb(tx)),
  } as unknown as PrismaService;

  return {
    service: new PropertiesAdminService(prisma),
    propertyUpdate,
    photoDeleteMany,
    photoCreateMany,
  };
}

function whereArg(findMany: jest.Mock): Prisma.PropertyWhereInput {
  const calls = findMany.mock.calls as Array<
    [Prisma.PropertyFindManyArgs]
  >;
  return calls[0][0].where as Prisma.PropertyWhereInput;
}

describe('PropertiesAdminService.list — filtros (AC-2)', () => {
  it('sin filtros: where solo con tenantId', async () => {
    const { service, findMany } = build();

    await service.list(TENANT, {});

    expect(whereArg(findMany)).toEqual({ tenantId: TENANT });
  });

  it('status y operation: igualdad exacta (ya existentes, no deben romperse)', async () => {
    const { service, findMany } = build();

    await service.list(TENANT, {
      status: PropertyStatus.ACTIVE,
      operation: OperationType.RENT,
    });

    expect(whereArg(findMany)).toEqual({
      tenantId: TENANT,
      status: PropertyStatus.ACTIVE,
      operation: OperationType.RENT,
    });
  });

  it('neighborhood se normaliza igual que en create (tilde y mayúsculas)', async () => {
    const { service, findMany } = build();

    await service.list(TENANT, { neighborhood: 'Núñez' });

    expect(whereArg(findMany)).toEqual({
      tenantId: TENANT,
      neighborhood: 'nunez',
    });
  });

  it('neighborhood con alias coloquial se resuelve a su forma canónica', async () => {
    const { service, findMany } = build();

    await service.list(TENANT, { neighborhood: 'Palermo Soho' });

    expect(whereArg(findMany)).toEqual({
      tenantId: TENANT,
      neighborhood: 'palermo',
    });
  });

  it('minPrice solo: price.gte', async () => {
    const { service, findMany } = build();

    await service.list(TENANT, { minPrice: 100_000 });

    expect(whereArg(findMany)).toEqual({
      tenantId: TENANT,
      price: { gte: 100_000 },
    });
  });

  it('maxPrice solo: price.lte', async () => {
    const { service, findMany } = build();

    await service.list(TENANT, { maxPrice: 500_000 });

    expect(whereArg(findMany)).toEqual({
      tenantId: TENANT,
      price: { lte: 500_000 },
    });
  });

  it('minPrice y maxPrice juntos: un único price con gte y lte', async () => {
    const { service, findMany } = build();

    await service.list(TENANT, { minPrice: 100_000, maxPrice: 500_000 });

    expect(whereArg(findMany)).toEqual({
      tenantId: TENANT,
      price: { gte: 100_000, lte: 500_000 },
    });
  });

  it('rooms: igualdad exacta, sin relajar', async () => {
    const { service, findMany } = build();

    await service.list(TENANT, { rooms: 2 });

    expect(whereArg(findMany)).toEqual({
      tenantId: TENANT,
      rooms: 2,
    });
  });

  it('rooms = 0 se aplica (no se trata como falsy/ausente)', async () => {
    const { service, findMany } = build();

    await service.list(TENANT, { rooms: 0 });

    expect(whereArg(findMany)).toEqual({
      tenantId: TENANT,
      rooms: 0,
    });
  });

  it('q: title contains insensitive, recortado', async () => {
    const { service, findMany } = build();

    await service.list(TENANT, { q: '  depto  ' });

    expect(whereArg(findMany)).toEqual({
      tenantId: TENANT,
      title: { contains: 'depto', mode: 'insensitive' },
    });
  });

  it('q vacío tras el trim no se aplica', async () => {
    const { service, findMany } = build();

    await service.list(TENANT, { q: '   ' });

    expect(whereArg(findMany)).toEqual({ tenantId: TENANT });
  });

  it('combinación de todos los filtros arma el where esperado', async () => {
    const { service, findMany } = build();

    await service.list(TENANT, {
      status: PropertyStatus.ACTIVE,
      operation: OperationType.SALE,
      neighborhood: 'Belgrano Chico',
      minPrice: 50_000,
      maxPrice: 300_000,
      rooms: 3,
      q: 'luminoso',
    });

    expect(whereArg(findMany)).toEqual({
      tenantId: TENANT,
      status: PropertyStatus.ACTIVE,
      operation: OperationType.SALE,
      neighborhood: 'belgrano',
      price: { gte: 50_000, lte: 300_000 },
      rooms: 3,
      title: { contains: 'luminoso', mode: 'insensitive' },
    });
  });
});

describe('PropertiesAdminService.remove — AC-9/AC-10', () => {
  it('propiedad inexistente / de otro tenant: NotFoundException, no borra', async () => {
    const { service, propertyDelete } = buildForRemove({ property: null });

    await expect(service.remove(TENANT, PROPERTY_ID)).rejects.toThrow(
      NotFoundException,
    );
    expect(propertyDelete).not.toHaveBeenCalled();
  });

  it('con Appointment existente del mismo tenant: ConflictException, no borra', async () => {
    const { service, appointmentFindFirst, propertyDelete } = buildForRemove({
      appointment: { id: 'appointment-1' },
    });

    await expect(service.remove(TENANT, PROPERTY_ID)).rejects.toThrow(
      new ConflictException(
        'No se puede eliminar: la propiedad tiene visitas agendadas. Cambiá su estado a Pausada para sacarla de circulación.',
      ),
    );
    expect(appointmentFindFirst).toHaveBeenCalledWith({
      where: { tenantId: TENANT, propertyId: PROPERTY_ID },
      select: { id: true },
    });
    expect(propertyDelete).not.toHaveBeenCalled();
  });

  it('sin citas: borra', async () => {
    const { service, propertyDelete } = buildForRemove({ appointment: null });

    await service.remove(TENANT, PROPERTY_ID);

    expect(propertyDelete).toHaveBeenCalledWith({
      where: { id: PROPERTY_ID },
    });
  });

  it('con una cita del mismo propertyId pero de otro tenant: no bloquea, borra igual', async () => {
    // El mock de appointment.findFirst simula el where { tenantId, propertyId }:
    // como el where ya filtra por tenantId, una cita de otro tenant nunca
    // aparece en el resultado — reproducimos ese comportamiento devolviendo null.
    const { service, appointmentFindFirst, propertyDelete } = buildForRemove({
      appointment: null,
    });

    await service.remove(TENANT, PROPERTY_ID);

    expect(appointmentFindFirst).toHaveBeenCalledWith({
      where: { tenantId: TENANT, propertyId: PROPERTY_ID },
      select: { id: true },
    });
    expect(propertyDelete).toHaveBeenCalledWith({
      where: { id: PROPERTY_ID },
    });
  });
});

describe('PropertiesAdminService.update — fotos (AC-7/AC-11/AC-12)', () => {
  it('photoUrls presente: reemplazo completo, position = índice del array', async () => {
    const { service, photoDeleteMany, photoCreateMany } = buildForUpdate();

    await service.update(TENANT, PROPERTY_ID, {
      photoUrls: [
        'https://example.com/a.jpg',
        'https://example.com/b.jpg',
        'https://example.com/c.jpg',
      ],
    } as UpdatePropertyDto);

    expect(photoDeleteMany).toHaveBeenCalledWith({
      where: { propertyId: PROPERTY_ID },
    });
    expect(photoCreateMany).toHaveBeenCalledWith({
      data: [
        { propertyId: PROPERTY_ID, url: 'https://example.com/a.jpg', position: 0 },
        { propertyId: PROPERTY_ID, url: 'https://example.com/b.jpg', position: 1 },
        { propertyId: PROPERTY_ID, url: 'https://example.com/c.jpg', position: 2 },
      ],
    });
  });

  it('photoUrls: [] borra todas las fotos y no crea ninguna', async () => {
    const { service, photoDeleteMany, photoCreateMany } = buildForUpdate();

    await service.update(TENANT, PROPERTY_ID, {
      photoUrls: [],
    } as UpdatePropertyDto);

    expect(photoDeleteMany).toHaveBeenCalledWith({
      where: { propertyId: PROPERTY_ID },
    });
    expect(photoCreateMany).not.toHaveBeenCalled();
  });

  it('sin photoUrls: no toca fotos existentes', async () => {
    const { service, photoDeleteMany, photoCreateMany, propertyUpdate } =
      buildForUpdate();

    await service.update(TENANT, PROPERTY_ID, {
      title: 'Nuevo título',
    } as UpdatePropertyDto);

    expect(photoDeleteMany).not.toHaveBeenCalled();
    expect(photoCreateMany).not.toHaveBeenCalled();
    expect(propertyUpdate).toHaveBeenCalledWith({
      where: { id: PROPERTY_ID },
      data: expect.objectContaining({ title: 'Nuevo título' }),
      include: expect.anything(),
    });
  });

  it('propiedad inexistente / de otro tenant: NotFoundException, no toca fotos', async () => {
    const { service, photoDeleteMany } = buildForUpdate({ property: null });

    await expect(
      service.update(TENANT, PROPERTY_ID, {
        photoUrls: ['https://example.com/a.jpg'],
      } as UpdatePropertyDto),
    ).rejects.toThrow(NotFoundException);
    expect(photoDeleteMany).not.toHaveBeenCalled();
  });
});
