import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { OperationType } from '@prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import { PropertySearchService } from '../src/properties/property-search.service';
import { ConfigService } from '@nestjs/config';
import type { EnvConfig } from '../src/config/env.schema';

describe('PropertySearchService (e2e, Postgres real)', () => {
  const suffix = randomBytes(4).toString('hex');
  let prisma: PrismaService;
  let service: PropertySearchService;
  let tenantId: string;
  let leadId: string;

  beforeAll(async () => {
    const config = {
      get: () => process.env.DATABASE_URL,
    } as unknown as ConfigService<EnvConfig, true>;
    prisma = new PrismaService(config);
    await prisma.onModuleInit();
    service = new PropertySearchService(prisma);

    const tenant = await prisma.tenant.create({
      data: {
        name: 'Property Search Test Tenant',
        slug: `property-search-test-${suffix}`,
        phoneNumberId: `property-search-phone-${suffix}`,
        accessTokenEnc: 'irrelevante',
        apiKeyHash: 'irrelevante',
      },
    });
    tenantId = tenant.id;

    const lead = await prisma.lead.create({
      data: { tenantId, phone: `5491100000${suffix}` },
    });
    leadId = lead.id;

    await prisma.property.createMany({
      data: [
        // Match exacto: caballito, RENT, <=100000, rooms>=2
        {
          tenantId,
          externalRef: 'a',
          title: 'A',
          operation: OperationType.RENT,
          propertyType: 'departamento',
          price: 90000,
          neighborhood: 'caballito',
          rooms: 2,
        },
        {
          tenantId,
          externalRef: 'b',
          title: 'B',
          operation: OperationType.RENT,
          propertyType: 'departamento',
          price: 95000,
          neighborhood: 'caballito',
          rooms: 3,
        },
        // Dentro de la tolerancia +10% (100000*1.1=110000)
        {
          tenantId,
          externalRef: 'c',
          title: 'C',
          operation: OperationType.RENT,
          propertyType: 'departamento',
          price: 108000,
          neighborhood: 'caballito',
          rooms: 2,
        },
        // Fuera de tolerancia
        {
          tenantId,
          externalRef: 'd',
          title: 'D',
          operation: OperationType.RENT,
          propertyType: 'departamento',
          price: 150000,
          neighborhood: 'caballito',
          rooms: 2,
        },
        // Otro barrio, mismo resto de filtros (para probar relajación de barrio)
        {
          tenantId,
          externalRef: 'e',
          title: 'E',
          operation: OperationType.RENT,
          propertyType: 'departamento',
          price: 95000,
          neighborhood: 'palermo',
          rooms: 2,
        },
        // SALE, no debería aparecer nunca en búsquedas de RENT
        {
          tenantId,
          externalRef: 'f',
          title: 'F',
          operation: OperationType.SALE,
          propertyType: 'departamento',
          price: 90000,
          neighborhood: 'caballito',
          rooms: 2,
        },
        // Única con cochera (para probar el filtro fuerte garage/petsAllowed). Precio
        // 109000 a propósito: entra en la tolerancia +10% de 100000 pero queda 4ta en
        // precio, así no interfiere con el test de matches exactos (limit 3).
        {
          tenantId,
          externalRef: 'g',
          title: 'G',
          operation: OperationType.RENT,
          propertyType: 'departamento',
          price: 109000,
          neighborhood: 'caballito',
          rooms: 2,
          garage: true,
          petsAllowed: true,
        },
      ],
    });
  });

  afterAll(async () => {
    await prisma.tenant.delete({ where: { id: tenantId } });
    await prisma.$disconnect();
  });

  it('devuelve matches exactos ordenados por precio ascendente, respetando tolerancia +10%', async () => {
    const outcome = await service.search(tenantId, {
      operation: OperationType.RENT,
      neighborhoods: ['caballito'],
      maxPrice: 100000,
      currency: null,
      minRooms: 2,
      garage: null,
      petsAllowed: null,
    });

    expect(outcome.relaxed).toBeNull();
    // a=90000, b=95000, c=108000 (dentro del +10% de tolerancia sobre 100000)
    expect(outcome.properties.map((p) => p.externalRef)).toEqual([
      'a',
      'b',
      'c',
    ]);
  });

  it('no filtra por operation cruzado (SALE no aparece en búsqueda RENT)', async () => {
    const outcome = await service.search(tenantId, {
      operation: OperationType.RENT,
      neighborhoods: ['caballito'],
      maxPrice: 200000,
      currency: null,
      minRooms: null,
      garage: null,
      petsAllowed: null,
    });

    expect(
      outcome.properties.every((p) => p.operation === OperationType.RENT),
    ).toBe(true);
  });

  it('NO relaja el barrio: si la zona pedida está vacía, devuelve empty_zone (para preguntar por otra)', async () => {
    const outcome = await service.search(tenantId, {
      operation: OperationType.RENT,
      neighborhoods: ['villa urquiza'], // no hay ninguna propiedad ahí en este set de prueba
      maxPrice: 100000,
      currency: null,
      minRooms: 2,
      garage: null,
      petsAllowed: null,
    });

    expect(outcome.relaxed).toBe('empty_zone');
    expect(outcome.properties).toEqual([]);
  });

  it('relaja ambientes cuando barrio+precio no alcanzan', async () => {
    const outcome = await service.search(tenantId, {
      operation: OperationType.RENT,
      neighborhoods: ['caballito'],
      maxPrice: 100000,
      currency: null,
      minRooms: 6, // ninguna propiedad tiene 6 ambientes
      garage: null,
      petsAllowed: null,
    });

    expect(outcome.relaxed).toBe('rooms');
  });

  it('devuelve vacío (sin reventar) si ni relajando todo hay resultados', async () => {
    const outcome = await service.search(tenantId, {
      operation: OperationType.TEMP_RENT, // no hay ninguna propiedad TEMP_RENT
      neighborhoods: ['caballito'],
      maxPrice: 100000,
      currency: null,
      minRooms: 2,
      garage: null,
      petsAllowed: null,
    });

    expect(outcome.properties).toEqual([]);
  });

  it('filtra por garage cuando el lead lo pidió explícitamente (filtro duro, no se relaja)', async () => {
    const outcome = await service.search(tenantId, {
      operation: OperationType.RENT,
      neighborhoods: ['caballito'],
      maxPrice: 100000,
      currency: null,
      minRooms: 2,
      garage: true,
      petsAllowed: null,
    });

    expect(outcome.properties.map((p) => p.externalRef)).toEqual(['g']);
  });

  it('filtra por petsAllowed cuando el lead lo pidió explícitamente', async () => {
    const outcome = await service.search(tenantId, {
      operation: OperationType.RENT,
      neighborhoods: ['caballito'],
      maxPrice: 100000,
      currency: null,
      minRooms: 2,
      garage: null,
      petsAllowed: true,
    });

    expect(outcome.properties.map((p) => p.externalRef)).toEqual(['g']);
  });

  it('presupuesto en USD nunca se compara contra precios en otra moneda', async () => {
    // Todo el stock del set es currency USD (default del schema): un
    // presupuesto declarado en ARS no debe matchear nada, ni siquiera en el
    // intento over_budget (sería comparar peras con manzanas).
    const outcome = await service.search(tenantId, {
      operation: OperationType.RENT,
      neighborhoods: ['caballito'],
      maxPrice: 90000,
      currency: 'ARS',
      minRooms: 2,
      garage: null,
      petsAllowed: null,
    });

    expect(outcome.properties).toEqual([]);
    // La zona SÍ tiene stock para RENT: no debe mentir con 'empty_zone'.
    expect(outcome.relaxed).toBeNull();
  });

  it('todo por encima del presupuesto -> over_budget con lo más barato (no finge "amplié un poco")', async () => {
    const outcome = await service.search(tenantId, {
      operation: OperationType.RENT,
      neighborhoods: ['caballito'],
      maxPrice: 50000, // stock arranca en 90000: ni con +25% alcanza
      currency: null,
      minRooms: 2,
      garage: null,
      petsAllowed: null,
    });

    expect(outcome.relaxed).toBe('over_budget');
    expect(outcome.properties.map((p) => p.externalRef)).toEqual([
      'a',
      'b',
      'c',
    ]);
  });

  it('la relajación de precio avisada queda acotada a +25% (no elimina el filtro)', async () => {
    const outcome = await service.search(tenantId, {
      operation: OperationType.RENT,
      neighborhoods: ['caballito'],
      maxPrice: 100000,
      currency: null,
      minRooms: 4, // nada de 4+ ambientes en el set
      garage: null,
      petsAllowed: null,
    });

    // Se relajaron los ambientes, pero el precio sigue capado en 125000:
    // 'd' (150000) NO debe aparecer.
    expect(outcome.relaxed).toBe('rooms');
    expect(outcome.properties.map((p) => p.externalRef)).not.toContain('d');
  });

  it('searchAndRecordForLead persiste lastSearchIds en el lead', async () => {
    const outcome = await service.searchAndRecordForLead(tenantId, leadId, {
      operation: OperationType.RENT,
      neighborhoods: ['caballito'],
      maxPrice: 100000,
      currency: null,
      minRooms: 2,
      garage: null,
      petsAllowed: null,
    });

    const updatedLead = await prisma.lead.findUniqueOrThrow({
      where: { id: leadId },
    });
    expect(updatedLead.lastSearchIds.sort()).toEqual(
      outcome.properties.map((p) => p.id).sort(),
    );
    expect(updatedLead.lastSearchIds.length).toBeGreaterThan(0);
  });

  it('un refinamiento sin resultados NO pisa lastSearchIds (el lead sigue viendo las fichas anteriores)', async () => {
    // Deja lastSearchIds poblado con una búsqueda que sí devuelve resultados...
    const withResults = await service.searchAndRecordForLead(tenantId, leadId, {
      operation: OperationType.RENT,
      neighborhoods: ['caballito'],
      maxPrice: 100000,
      currency: null,
      minRooms: 2,
      garage: null,
      petsAllowed: null,
    });
    expect(withResults.properties.length).toBeGreaterThan(0);

    // ...y después refiná con algo imposible (moneda sin stock): 0 resultados.
    const empty = await service.searchAndRecordForLead(tenantId, leadId, {
      operation: OperationType.RENT,
      neighborhoods: ['caballito'],
      maxPrice: 100000,
      currency: 'ARS', // todo el stock del set es USD
      minRooms: 2,
      garage: null,
      petsAllowed: null,
    });
    expect(empty.properties).toEqual([]);

    const updatedLead = await prisma.lead.findUniqueOrThrow({
      where: { id: leadId },
    });
    expect(updatedLead.lastSearchIds.sort()).toEqual(
      withResults.properties.map((p) => p.id).sort(),
    );
  });
});
