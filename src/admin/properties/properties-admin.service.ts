import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type Property, type PropertyStatus } from '@prisma/client';
import { normalizeNeighborhood } from '../../properties/neighborhoods';
import { PrismaService } from '../../prisma/prisma.service';
import type { CreatePropertyDto } from './create-property.dto';
import type { UpdatePropertyDto } from './update-property.dto';

const PAGE_SIZE = 20;
const PROPERTY_INCLUDE = { photos: { orderBy: { position: 'asc' as const } } };

export interface UpsertPropertyInput {
  externalRef: string;
  title: string;
  description?: string;
  operation: CreatePropertyDto['operation'];
  propertyType: string;
  price: number;
  currency?: string;
  expenses?: number;
  neighborhood: string;
  city?: string;
  address?: string;
  rooms?: number;
  bedrooms?: number;
  bathrooms?: number;
  areaM2?: number;
  garage?: boolean;
  petsAllowed?: boolean;
  features?: string[];
  listingUrl?: string;
  photoUrls?: string[];
}

@Injectable()
export class PropertiesAdminService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    tenantId: string,
    filters: {
      status?: PropertyStatus;
      operation?: CreatePropertyDto['operation'];
      neighborhood?: string;
      minPrice?: number;
      maxPrice?: number;
      rooms?: number;
      q?: string;
      page?: number;
    },
  ) {
    const page = filters.page ?? 1;
    const trimmedQ = filters.q?.trim();
    const where: Prisma.PropertyWhereInput = {
      tenantId,
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.operation ? { operation: filters.operation } : {}),
      ...(filters.neighborhood
        ? { neighborhood: normalizeNeighborhood(filters.neighborhood) }
        : {}),
      ...(filters.minPrice !== undefined || filters.maxPrice !== undefined
        ? {
            price: {
              ...(filters.minPrice !== undefined
                ? { gte: filters.minPrice }
                : {}),
              ...(filters.maxPrice !== undefined
                ? { lte: filters.maxPrice }
                : {}),
            },
          }
        : {}),
      ...(filters.rooms !== undefined ? { rooms: filters.rooms } : {}),
      ...(trimmedQ
        ? { title: { contains: trimmedQ, mode: 'insensitive' } }
        : {}),
    };

    const [properties, total] = await Promise.all([
      this.prisma.property.findMany({
        where,
        include: PROPERTY_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
      this.prisma.property.count({ where }),
    ]);

    return { properties, total, page, pageSize: PAGE_SIZE };
  }

  async getOne(tenantId: string, propertyId: string): Promise<Property> {
    const property = await this.prisma.property.findFirst({
      where: { id: propertyId, tenantId },
      include: PROPERTY_INCLUDE,
    });
    if (!property) {
      throw new NotFoundException('Propiedad no encontrada');
    }
    return property;
  }

  async create(tenantId: string, dto: CreatePropertyDto): Promise<Property> {
    try {
      return await this.prisma.property.create({
        data: {
          tenantId,
          externalRef: dto.externalRef,
          title: dto.title,
          description: dto.description,
          operation: dto.operation,
          propertyType: dto.propertyType,
          price: dto.price,
          currency: dto.currency,
          expenses: dto.expenses,
          neighborhood: normalizeNeighborhood(dto.neighborhood),
          city: dto.city,
          address: dto.address,
          rooms: dto.rooms,
          bedrooms: dto.bedrooms,
          bathrooms: dto.bathrooms,
          areaM2: dto.areaM2,
          garage: dto.garage,
          petsAllowed: dto.petsAllowed,
          features: dto.features ?? [],
          listingUrl: dto.listingUrl,
          photos: {
            create: (dto.photoUrls ?? []).map((url, position) => ({
              url,
              position,
            })),
          },
        },
        include: PROPERTY_INCLUDE,
      });
    } catch (error) {
      throw this.mapUniqueConstraint(error);
    }
  }

  async update(
    tenantId: string,
    propertyId: string,
    dto: UpdatePropertyDto,
  ): Promise<Property> {
    await this.getOne(tenantId, propertyId); // 404 si no existe / no es de este tenant
    return this.prisma.property.update({
      where: { id: propertyId },
      data: {
        title: dto.title,
        description: dto.description,
        operation: dto.operation,
        propertyType: dto.propertyType,
        price: dto.price,
        currency: dto.currency,
        expenses: dto.expenses,
        neighborhood: dto.neighborhood
          ? normalizeNeighborhood(dto.neighborhood)
          : undefined,
        city: dto.city,
        address: dto.address,
        rooms: dto.rooms,
        bedrooms: dto.bedrooms,
        bathrooms: dto.bathrooms,
        areaM2: dto.areaM2,
        garage: dto.garage,
        petsAllowed: dto.petsAllowed,
        features: dto.features,
        listingUrl: dto.listingUrl,
      },
      include: PROPERTY_INCLUDE,
    });
  }

  /** Endpoint crítico: pausar o marcar vendida/alquilada una propiedad. */
  async updateStatus(
    tenantId: string,
    propertyId: string,
    status: PropertyStatus,
  ): Promise<Property> {
    await this.getOne(tenantId, propertyId);
    return this.prisma.property.update({
      where: { id: propertyId },
      data: { status },
      include: PROPERTY_INCLUDE,
    });
  }

  async remove(tenantId: string, propertyId: string): Promise<void> {
    await this.getOne(tenantId, propertyId);
    await this.prisma.property.delete({ where: { id: propertyId } });
  }

  /** Upsert por (tenantId, externalRef) — usado por el alta manual con externalRef y por el import CSV. */
  async upsertByExternalRef(
    tenantId: string,
    input: UpsertPropertyInput,
  ): Promise<Property> {
    const neighborhood = normalizeNeighborhood(input.neighborhood);
    const replacePhotos = input.photoUrls && input.photoUrls.length > 0;

    return this.prisma.property.upsert({
      where: {
        tenantId_externalRef: { tenantId, externalRef: input.externalRef },
      },
      create: {
        tenantId,
        externalRef: input.externalRef,
        title: input.title,
        description: input.description,
        operation: input.operation,
        propertyType: input.propertyType,
        price: input.price,
        currency: input.currency,
        expenses: input.expenses,
        neighborhood,
        city: input.city,
        address: input.address,
        rooms: input.rooms,
        bedrooms: input.bedrooms,
        bathrooms: input.bathrooms,
        areaM2: input.areaM2,
        garage: input.garage,
        petsAllowed: input.petsAllowed,
        features: input.features ?? [],
        listingUrl: input.listingUrl,
        photos: {
          create: (input.photoUrls ?? []).map((url, position) => ({
            url,
            position,
          })),
        },
      },
      update: {
        title: input.title,
        description: input.description,
        operation: input.operation,
        propertyType: input.propertyType,
        price: input.price,
        currency: input.currency,
        expenses: input.expenses,
        neighborhood,
        city: input.city,
        address: input.address,
        rooms: input.rooms,
        bedrooms: input.bedrooms,
        bathrooms: input.bathrooms,
        areaM2: input.areaM2,
        garage: input.garage,
        petsAllowed: input.petsAllowed,
        features: input.features,
        listingUrl: input.listingUrl,
        ...(replacePhotos
          ? {
              photos: {
                deleteMany: {},
                create: input.photoUrls!.map((url, position) => ({
                  url,
                  position,
                })),
              },
            }
          : {}),
      },
    });
  }

  private mapUniqueConstraint(error: unknown): unknown {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      return new ConflictException(
        'Ya existe una propiedad con ese externalRef para este tenant',
      );
    }
    return error;
  }
}
