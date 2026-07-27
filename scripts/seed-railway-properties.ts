import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { OperationType, PrismaClient } from '@prisma/client';
import { normalizeNeighborhood } from '../src/properties/neighborhoods';

const DATABASE_URL = requireEnv('DATABASE_URL');
const TENANT_ID = requireEnv('SEED_TENANT_ID');

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Falta la variable de entorno ${name}.`);
  }
  return value;
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: DATABASE_URL }),
});

interface SeedProperty {
  externalRef: string;
  title: string;
  operation: OperationType;
  propertyType: string;
  price: number;
  currency: 'USD' | 'ARS';
  expenses?: number;
  neighborhood: string;
  rooms: number;
  bedrooms: number;
  bathrooms: number;
  areaM2: number;
  garage: boolean;
  petsAllowed?: boolean;
  features: string[];
}

const SEED_PROPERTIES: SeedProperty[] = [
  {
    externalRef: 'test-001',
    title: 'Monoambiente luminoso a metros del Botánico',
    operation: 'RENT',
    propertyType: 'departamento',
    price: 450,
    currency: 'USD',
    expenses: 45000,
    neighborhood: normalizeNeighborhood('Palermo Soho'),
    rooms: 1,
    bedrooms: 0,
    bathrooms: 1,
    areaM2: 32,
    garage: false,
    features: ['balcón', 'luminoso'],
  },
  {
    externalRef: 'test-002',
    title: '2 ambientes con balcón corrido en Palermo Hollywood',
    operation: 'RENT',
    propertyType: 'departamento',
    price: 620,
    currency: 'USD',
    expenses: 60000,
    neighborhood: normalizeNeighborhood('Palermo Hollywood'),
    rooms: 2,
    bedrooms: 1,
    bathrooms: 1,
    areaM2: 48,
    garage: false,
    features: ['balcón', 'amenities'],
  },
  {
    externalRef: 'test-003',
    title: 'Departamento a estrenar con cochera en Palermo',
    operation: 'SALE',
    propertyType: 'departamento',
    price: 185000,
    currency: 'USD',
    neighborhood: normalizeNeighborhood('Palermo'),
    rooms: 3,
    bedrooms: 2,
    bathrooms: 2,
    areaM2: 72,
    garage: true,
    features: ['cochera', 'amenities', 'a estrenar'],
  },
  {
    externalRef: 'test-004',
    title: 'PH con patio en el corazón de Caballito',
    operation: 'SALE',
    propertyType: 'ph',
    price: 132000,
    currency: 'USD',
    neighborhood: normalizeNeighborhood('Caballito'),
    rooms: 3,
    bedrooms: 2,
    bathrooms: 1,
    areaM2: 65,
    garage: false,
    features: ['patio', 'terraza'],
  },
  {
    externalRef: 'test-005',
    title: '2 ambientes reciclado cerca del Parque Rivadavia',
    operation: 'RENT',
    propertyType: 'departamento',
    price: 380000,
    currency: 'ARS',
    expenses: 55000,
    neighborhood: normalizeNeighborhood('Caballito'),
    rooms: 2,
    bedrooms: 1,
    bathrooms: 1,
    areaM2: 45,
    garage: false,
    features: ['reciclado', 'luminoso'],
  },
  {
    externalRef: 'test-006',
    title: 'Monoambiente ideal inversión en Caballito',
    operation: 'SALE',
    propertyType: 'departamento',
    price: 68000,
    currency: 'USD',
    neighborhood: normalizeNeighborhood('Caballito'),
    rooms: 1,
    bedrooms: 0,
    bathrooms: 1,
    areaM2: 28,
    garage: false,
    features: ['apto profesional'],
  },
  {
    externalRef: 'test-007',
    title: 'Departamento con vista abierta en Bajo Belgrano',
    operation: 'SALE',
    propertyType: 'departamento',
    price: 210000,
    currency: 'USD',
    neighborhood: normalizeNeighborhood('Bajo Belgrano'),
    rooms: 4,
    bedrooms: 3,
    bathrooms: 2,
    areaM2: 95,
    garage: true,
    features: ['vista abierta', 'cochera', 'baulera'],
  },
  {
    externalRef: 'test-008',
    title: '3 ambientes a la calle en Belgrano R',
    operation: 'RENT',
    propertyType: 'departamento',
    price: 750,
    currency: 'USD',
    expenses: 80000,
    neighborhood: normalizeNeighborhood('Belgrano R'),
    rooms: 3,
    bedrooms: 2,
    bathrooms: 2,
    areaM2: 78,
    garage: true,
    features: ['cochera', 'pet friendly'],
  },
  {
    externalRef: 'test-009',
    title: 'Casa con jardín y pileta en Belgrano',
    operation: 'SALE',
    propertyType: 'casa',
    price: 420000,
    currency: 'USD',
    neighborhood: normalizeNeighborhood('Belgrano'),
    rooms: 5,
    bedrooms: 4,
    bathrooms: 3,
    areaM2: 220,
    garage: true,
    features: ['jardín', 'pileta', 'parrilla'],
  },
  {
    externalRef: 'test-010',
    title: 'Departamento con balcón en Villa Urquiza',
    operation: 'RENT',
    propertyType: 'departamento',
    price: 420000,
    currency: 'ARS',
    expenses: 40000,
    neighborhood: normalizeNeighborhood('Villa Urquiza'),
    rooms: 2,
    bedrooms: 1,
    bathrooms: 1,
    areaM2: 50,
    garage: false,
    features: ['balcón', 'apto crédito'],
  },
  {
    externalRef: 'test-011',
    title: 'PH a nuevo con cochera doble en Villa Urquiza',
    operation: 'SALE',
    propertyType: 'ph',
    price: 155000,
    currency: 'USD',
    neighborhood: normalizeNeighborhood('Villa Urquiza'),
    rooms: 4,
    bedrooms: 3,
    bathrooms: 2,
    areaM2: 110,
    garage: true,
    features: ['cochera doble', 'terraza propia'],
  },
  {
    externalRef: 'test-012',
    title: '2 ambientes con balcón en Palermo, acepta mascotas',
    operation: 'RENT',
    propertyType: 'departamento',
    price: 650000,
    currency: 'ARS',
    expenses: 65000,
    neighborhood: normalizeNeighborhood('Palermo'),
    rooms: 2,
    bedrooms: 1,
    bathrooms: 1,
    areaM2: 46,
    garage: false,
    petsAllowed: true,
    features: ['balcón', 'pet friendly'],
  },
  {
    externalRef: 'test-013',
    title: '3 ambientes con patio en Caballito, admite perros',
    operation: 'RENT',
    propertyType: 'ph',
    price: 700000,
    currency: 'ARS',
    expenses: 30000,
    neighborhood: normalizeNeighborhood('Caballito'),
    rooms: 3,
    bedrooms: 2,
    bathrooms: 1,
    areaM2: 58,
    garage: false,
    petsAllowed: true,
    features: ['patio', 'pet friendly'],
  },
  {
    externalRef: 'test-014',
    title: '2 ambientes a estrenar en Belgrano, apto crédito',
    operation: 'SALE',
    propertyType: 'departamento',
    price: 118000,
    currency: 'USD',
    neighborhood: normalizeNeighborhood('Belgrano'),
    rooms: 2,
    bedrooms: 1,
    bathrooms: 1,
    areaM2: 48,
    garage: false,
    features: ['a estrenar', 'apto crédito'],
  },
  {
    externalRef: 'test-015',
    title: 'Departamento clásico con cochera en Recoleta',
    operation: 'SALE',
    propertyType: 'departamento',
    price: 165000,
    currency: 'USD',
    neighborhood: normalizeNeighborhood('Recoleta'),
    rooms: 2,
    bedrooms: 1,
    bathrooms: 1,
    areaM2: 55,
    garage: true,
    features: ['piso alto', 'balcón francés'],
  },
  {
    externalRef: 'test-016',
    title: 'Semipiso con pileta en Recoleta',
    operation: 'SALE',
    propertyType: 'departamento',
    price: 310000,
    currency: 'USD',
    neighborhood: normalizeNeighborhood('Recoleta'),
    rooms: 4,
    bedrooms: 3,
    bathrooms: 2,
    areaM2: 130,
    garage: true,
    features: ['pileta', 'amenities'],
  },
  {
    externalRef: 'test-017',
    title: '2 ambientes en Núñez, acepta mascotas',
    operation: 'RENT',
    propertyType: 'departamento',
    price: 480000,
    currency: 'ARS',
    expenses: 50000,
    neighborhood: normalizeNeighborhood('Nuñez'),
    rooms: 2,
    bedrooms: 1,
    bathrooms: 1,
    areaM2: 44,
    garage: false,
    petsAllowed: true,
    features: ['pet friendly'],
  },
  {
    externalRef: 'test-018',
    title: 'Monoambiente sin expensas altas en Flores',
    operation: 'RENT',
    propertyType: 'departamento',
    price: 260000,
    currency: 'ARS',
    expenses: 20000,
    neighborhood: normalizeNeighborhood('Flores'),
    rooms: 1,
    bedrooms: 0,
    bathrooms: 1,
    areaM2: 26,
    garage: false,
    petsAllowed: false,
    features: [],
  },
  {
    externalRef: 'test-019',
    title: '3 ambientes con cochera en Villa Devoto',
    operation: 'SALE',
    propertyType: 'departamento',
    price: 128000,
    currency: 'USD',
    neighborhood: normalizeNeighborhood('Villa Devoto'),
    rooms: 3,
    bedrooms: 2,
    bathrooms: 2,
    areaM2: 74,
    garage: true,
    features: ['cochera'],
  },
  {
    externalRef: 'test-020',
    title: '4 ambientes con pileta en San Isidro',
    operation: 'SALE',
    propertyType: 'casa',
    price: 380000,
    currency: 'USD',
    neighborhood: normalizeNeighborhood('San Isidro'),
    rooms: 4,
    bedrooms: 3,
    bathrooms: 3,
    areaM2: 180,
    garage: true,
    features: ['pileta', 'jardín'],
  },
];

async function main() {
  const tenant = await prisma.tenant.findUnique({ where: { id: TENANT_ID } });
  if (!tenant) {
    throw new Error(`No existe el tenant ${TENANT_ID}`);
  }

  for (const property of SEED_PROPERTIES) {
    await prisma.property.upsert({
      where: {
        tenantId_externalRef: {
          tenantId: tenant.id,
          externalRef: property.externalRef,
        },
      },
      update: {},
      create: {
        tenantId: tenant.id,
        externalRef: property.externalRef,
        title: property.title,
        operation: property.operation,
        propertyType: property.propertyType,
        price: property.price,
        currency: property.currency,
        expenses: property.expenses,
        neighborhood: property.neighborhood,
        city: 'CABA',
        rooms: property.rooms,
        bedrooms: property.bedrooms,
        bathrooms: property.bathrooms,
        areaM2: property.areaM2,
        garage: property.garage,
        petsAllowed: property.petsAllowed,
        features: property.features,
        photos: {
          create: [
            {
              url: `https://picsum.photos/seed/${property.externalRef}-1/800/600`,
              position: 0,
            },
            {
              url: `https://picsum.photos/seed/${property.externalRef}-2/800/600`,
              position: 1,
            },
          ],
        },
      },
    });
  }

  console.log(`Propiedades cargadas para tenant ${tenant.name} (${tenant.id}): ${SEED_PROPERTIES.length}`);
}

main()
  .catch((error: unknown) => {
    console.error('Error corriendo el seed:', error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
