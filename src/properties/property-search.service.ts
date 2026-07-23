import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  OperationType,
  Prisma,
  PropertyStatus,
  type Property,
  type PropertyPhoto,
} from '@prisma/client';
import type { EnvConfig } from '../config/env.schema';
import { PrismaService } from '../prisma/prisma.service';

export interface SearchFilters {
  operation: OperationType;
  /** Ya normalizados (ver properties/neighborhoods.ts). */
  neighborhoods: string[];
  maxPrice: number | null;
  /** Moneda del presupuesto del lead (USD | ARS). Solo tiene efecto junto con maxPrice. */
  currency: string | null;
  minRooms: number | null;
  garage: boolean | null;
  petsAllowed: boolean | null;
}

/**
 * 'empty_zone' = la zona pedida no tiene NADA (hay que preguntar por otra zona).
 * 'over_budget' = hay stock que encaja pero todo por encima del presupuesto
 * (se muestra lo más barato con un mensaje honesto, sin fingir que "se amplió
 * un poco").
 */
export type RelaxedCriterion =
  'rooms' | 'price' | 'over_budget' | 'empty_zone' | null;

export type PropertyWithPhotos = Property & { photos: PropertyPhoto[] };

export interface SearchOutcome {
  properties: PropertyWithPhotos[];
  /** Qué criterio se relajó para poder devolver resultados (null si no hizo falta relajar nada). */
  relaxed: RelaxedCriterion;
}

const RESULT_LIMIT = 3;
const PRICE_TOLERANCE = 1.1; // +10% silencioso (sin avisar)
const PRICE_RELAX_CAP = 1.25; // +25% máximo cuando se avisa "amplié el presupuesto"
/** Universo acotado para ordenar en memoria cuando hay que comparar precio sin moneda de referencia. */
const CANDIDATE_LIMIT = 100;

interface RelaxOptions {
  /** Multiplicador sobre maxPrice, o null para no filtrar por precio. */
  priceFactor: number | null;
  includeRooms: boolean;
  label: RelaxedCriterion;
}

/**
 * Búsqueda de propiedades (docs/02-DATOS.md §2): filtros duros con tolerancia
 * de +10% en precio. La ZONA es sagrada: nunca se amplía sola (si la zona no
 * tiene stock, el flujo le pregunta al lead por otra zona). Sí se flexibiliza
 * progresivamente presupuesto → ambientes DENTRO de la zona pedida.
 * Actualiza `lead.lastSearchIds` (whitelist para la validación de salida del LLM).
 */
@Injectable()
export class PropertySearchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<EnvConfig, true>,
  ) {}

  /**
   * Precio comparable en ARS. Solo para ORDENAR cuando hay stock en USD y ARS
   * mezclado y no hay moneda de referencia (sin `maxPrice` no se puede saber
   * contra qué moneda comparar): sin esto, "más baratos" comparaba 450 (USD)
   * contra 650.000 (ARS) como números pelados y el USD ganaba siempre por
   * magnitud, no por valor real. Nunca se usa para filtrar ni se muestra al lead.
   */
  private toComparableArs(price: Prisma.Decimal, currency: string): number {
    const amount = price.toNumber();
    return currency === 'USD'
      ? amount * this.config.get('USD_ARS_RATE', { infer: true })
      : amount;
  }

  async search(
    tenantId: string,
    filters: SearchFilters,
  ): Promise<SearchOutcome> {
    const attempts: RelaxOptions[] = [
      { priceFactor: PRICE_TOLERANCE, includeRooms: true, label: null },
    ];
    if (filters.maxPrice) {
      // Relajación de precio ACOTADA (+25%): "amplié un poco el presupuesto"
      // tiene que ser verdad; antes se eliminaba el filtro y se mostraba
      // cualquier cosa (+65% en el QA de personas §7).
      attempts.push({
        priceFactor: PRICE_RELAX_CAP,
        includeRooms: true,
        label: 'price',
      });
    }
    if (filters.minRooms) {
      attempts.push({
        priceFactor: filters.maxPrice ? PRICE_RELAX_CAP : null,
        includeRooms: false,
        label: 'rooms',
      });
    }
    if (filters.maxPrice) {
      // Último recurso: hay stock pero todo por encima del presupuesto ->
      // mostramos lo más barato con un mensaje honesto ('over_budget'),
      // primero respetando ambientes y si no, sin ellos.
      attempts.push({
        priceFactor: null,
        includeRooms: true,
        label: 'over_budget',
      });
      if (filters.minRooms) {
        attempts.push({
          priceFactor: null,
          includeRooms: false,
          label: 'over_budget',
        });
      }
    }

    for (const attempt of attempts) {
      const properties = await this.query(tenantId, filters, attempt);
      if (properties.length > 0) {
        return { properties, relaxed: attempt.label };
      }
    }

    // Nada, ni relajando presupuesto/ambientes dentro de la zona. 'empty_zone'
    // SOLO si la zona de verdad no tiene stock para esa operación (si tiene
    // pero ningún filtro dio, decir "en X no tenemos nada" sería mentira).
    if (filters.neighborhoods.length > 0) {
      const zoneHasStock = await this.hasStockInZone(
        tenantId,
        filters.neighborhoods,
        filters.operation,
      );
      return { properties: [], relaxed: zoneHasStock ? null : 'empty_zone' };
    }
    return { properties: [], relaxed: null };
  }

  /** Corre la búsqueda y persiste `lastSearchIds` en el lead (lista blanca de salida). */
  async searchAndRecordForLead(
    tenantId: string,
    leadId: string,
    filters: SearchFilters,
  ): Promise<SearchOutcome> {
    const outcome = await this.search(tenantId, filters);
    // `lastSearchIds` refleja lo último que el lead VIO. Si el refinamiento no
    // devolvió nada (no se le mostró nada nuevo), las fichas anteriores siguen
    // en su pantalla: pisar la whitelist acá le impediría decir "la 1" sobre
    // lo que ya tiene a la vista.
    if (outcome.properties.length > 0) {
      await this.prisma.lead.update({
        where: { id: leadId },
        data: {
          lastSearchIds: outcome.properties.map((property) => property.id),
        },
      });
    }
    return outcome;
  }

  /**
   * ¿Hay AL MENOS una propiedad activa en esas zonas? (filtrando por operación
   * si ya se conoce). Sirve para cortar la calificación temprano cuando la zona
   * pedida está vacía, en vez de seguir preguntando ambientes/presupuesto para
   * después decir que no hay nada.
   */
  async hasStockInZone(
    tenantId: string,
    neighborhoods: string[],
    operation: OperationType | null,
  ): Promise<boolean> {
    if (neighborhoods.length === 0) {
      return true; // sin zona no hay nada que descartar
    }
    const count = await this.prisma.property.count({
      where: {
        tenantId,
        status: PropertyStatus.ACTIVE,
        neighborhood: { in: neighborhoods },
        ...(operation ? { operation } : {}),
      },
    });
    return count > 0;
  }

  /** De una lista de zonas candidatas, cuáles tienen stock activo (mismo orden). */
  async zonesWithStock(
    tenantId: string,
    candidates: readonly string[],
    operation: OperationType | null,
  ): Promise<string[]> {
    if (candidates.length === 0) return [];
    const rows = await this.prisma.property.findMany({
      where: {
        tenantId,
        status: PropertyStatus.ACTIVE,
        neighborhood: { in: [...candidates] },
        ...(operation ? { operation } : {}),
      },
      select: { neighborhood: true },
      distinct: ['neighborhood'],
    });
    const withStock = new Set(rows.map((r) => r.neighborhood));
    return candidates.filter((zone) => withStock.has(zone));
  }

  /** Las N zonas con más stock activo (fallback cuando no hay aledañas mapeadas/con stock). */
  async topStockZones(
    tenantId: string,
    operation: OperationType | null,
    limit: number,
  ): Promise<string[]> {
    const grouped = await this.prisma.property.groupBy({
      by: ['neighborhood'],
      where: {
        tenantId,
        status: PropertyStatus.ACTIVE,
        ...(operation ? { operation } : {}),
      },
      _count: { neighborhood: true },
      orderBy: { _count: { neighborhood: 'desc' } },
      take: limit,
    });
    return grouped.map((g) => g.neighborhood);
  }

  /**
   * Búsqueda teaser (§3): operación + zona alcanzan, sin esperar ambientes ni
   * presupuesto. Selecciona hasta 3 propiedades que CUBREN el rango de precios
   * (la más barata, una intermedia, la más cara) en vez de las 3 más baratas,
   * para que la reacción del lead revele su presupuesto sin preguntarlo en frío.
   */
  async teaserSearch(
    tenantId: string,
    leadId: string,
    operation: OperationType,
    neighborhoods: string[],
  ): Promise<SearchOutcome> {
    const all = await this.prisma.property.findMany({
      where: {
        tenantId,
        status: PropertyStatus.ACTIVE,
        operation,
        neighborhood: { in: neighborhoods },
      },
      include: { photos: { orderBy: { position: 'asc' } } },
    });
    // Sin presupuesto (recién arranca la búsqueda): puede haber USD y ARS
    // mezclado, se ordena por valor normalizado (ver `toComparableArs`), no
    // por precio crudo.
    const sorted = [...all].sort(
      (a, b) =>
        this.toComparableArs(a.price, a.currency) -
        this.toComparableArs(b.price, b.currency),
    );

    const properties = this.pickPriceRange(sorted, RESULT_LIMIT);
    await this.prisma.lead.update({
      where: { id: leadId },
      data: { lastSearchIds: properties.map((p) => p.id) },
    });
    return { properties, relaxed: null };
  }

  /** Más barata + intermedia + más cara (orden ascendente). Si hay ≤ limit, todas. */
  private pickPriceRange(
    sortedByPriceAsc: PropertyWithPhotos[],
    limit: number,
  ): PropertyWithPhotos[] {
    if (sortedByPriceAsc.length <= limit) {
      return sortedByPriceAsc;
    }
    const cheapest = sortedByPriceAsc[0];
    const mostExpensive = sortedByPriceAsc[sortedByPriceAsc.length - 1];
    const middle = sortedByPriceAsc[Math.floor(sortedByPriceAsc.length / 2)];
    return [cheapest, middle, mostExpensive];
  }

  private async query(
    tenantId: string,
    filters: SearchFilters,
    opts: RelaxOptions,
  ): Promise<PropertyWithPhotos[]> {
    const where: Prisma.PropertyWhereInput = {
      tenantId,
      status: PropertyStatus.ACTIVE,
      operation: filters.operation,
    };

    // La zona nunca se relaja automáticamente (ver doc de la clase).
    if (filters.neighborhoods.length > 0) {
      where.neighborhood = { in: filters.neighborhoods };
    }
    if (filters.maxPrice) {
      if (opts.priceFactor !== null) {
        where.price = { lte: filters.maxPrice * opts.priceFactor };
      }
      // Un presupuesto solo es comparable contra precios en SU moneda: sin
      // esto, "800 USD" se comparaba contra 520.000 ARS como números pelados
      // (QA personas §4). Aplica también al intento 'over_budget'.
      if (filters.currency) {
        where.currency = filters.currency;
      }
    }
    if (opts.includeRooms && filters.minRooms) {
      // "Monoambiente" (1 ambiente) es la unidad más chica que existe: pedirlo
      // como piso ("rooms >= 1") no filtra nada, porque CUALQUIER propiedad
      // cumple "1 o más" (bug real observado: pedir monoambiente devolvía un 3
      // ambientes). Es el único valor de `minRooms` donde el lead quiere
      // exactamente eso, no "esto para arriba" — para 2+ ambientes sí tiene
      // sentido el piso ("2 ambientes" admite que aparezca un 3).
      where.rooms =
        filters.minRooms === 1 ? { equals: 1 } : { gte: filters.minRooms };
    }
    // Cochera/mascotas no se relajan (no forman parte del algoritmo de relajación
    // progresiva documentado en 02-DATOS.md §2): si el lead las pidió, son un filtro duro.
    if (filters.garage) {
      where.garage = true;
    }
    if (filters.petsAllowed) {
      where.petsAllowed = true;
    }

    const currencyPinned = Boolean(filters.maxPrice && filters.currency);
    // Este intento relajó ambientes (no aplicó `where.rooms`) habiendo pedido
    // un target: mostrar lo más CERCANO a ese target, no lo más barato sin
    // más. Distancia absoluta (no "más ambientes primero"): para un pedido de
    // 5 ambientes lo restante siempre queda por debajo (más cerca = más
    // ambientes), pero para "monoambiente" (target=1, filtro exacto) lo
    // restante queda por ARRIBA (más cerca = MENOS ambientes) — la distancia
    // absoluta cubre ambos casos sin asumir de qué lado cae lo relajado.
    const sortByRoomsProximity = !opts.includeRooms && filters.minRooms !== null;
    const roomsTarget = filters.minRooms;

    // Camino rápido: moneda de referencia fijada (stock de una sola moneda) y
    // sin relajación de ambientes -> ordenar por precio crudo en la DB.
    if (currencyPinned && !sortByRoomsProximity) {
      return this.prisma.property.findMany({
        where,
        orderBy: { price: 'asc' },
        take: RESULT_LIMIT,
        include: { photos: { orderBy: { position: 'asc' } } },
      });
    }

    // En cualquier otro caso hace falta ordenar en memoria: por precio
    // normalizado cuando el stock puede mezclar USD/ARS (`toComparableArs`),
    // y/o por cercanía de ambientes cuando se relajó ese filtro.
    const candidates = await this.prisma.property.findMany({
      where,
      take: CANDIDATE_LIMIT,
      include: { photos: { orderBy: { position: 'asc' } } },
    });
    return candidates
      .sort((a, b) => {
        if (sortByRoomsProximity && roomsTarget !== null) {
          const distA = Math.abs((a.rooms ?? 0) - roomsTarget);
          const distB = Math.abs((b.rooms ?? 0) - roomsTarget);
          if (distA !== distB) return distA - distB;
        }
        const priceA = currencyPinned
          ? a.price.toNumber()
          : this.toComparableArs(a.price, a.currency);
        const priceB = currencyPinned
          ? b.price.toNumber()
          : this.toComparableArs(b.price, b.currency);
        return priceA - priceB;
      })
      .slice(0, RESULT_LIMIT);
  }
}
