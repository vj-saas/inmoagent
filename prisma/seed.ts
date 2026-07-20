import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { OperationType, PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import { encrypt } from '../src/common/crypto';
import { normalizeNeighborhood } from '../src/properties/neighborhoods';

const APP_ENCRYPTION_KEY = requireEnv('APP_ENCRYPTION_KEY');
const DATABASE_URL = requireEnv('DATABASE_URL');

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Falta la variable de entorno ${name} para correr el seed.`,
    );
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
    externalRef: 'demo-001',
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
    externalRef: 'demo-002',
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
    externalRef: 'demo-003',
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
    externalRef: 'demo-004',
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
    externalRef: 'demo-005',
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
    externalRef: 'demo-006',
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
    externalRef: 'demo-007',
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
    externalRef: 'demo-008',
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
    externalRef: 'demo-009',
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
    externalRef: 'demo-010',
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
    externalRef: 'demo-011',
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
    externalRef: 'demo-012',
    title: 'Monoambiente a estrenar cerca del Parque Sarmiento',
    operation: 'RENT',
    propertyType: 'departamento',
    price: 340000,
    currency: 'ARS',
    expenses: 35000,
    neighborhood: normalizeNeighborhood('Villa Urquiza'),
    rooms: 1,
    bedrooms: 0,
    bathrooms: 1,
    areaM2: 30,
    garage: false,
    features: ['a estrenar', 'amenities'],
  },
  // --- Más ARS en Palermo/Caballito (los precios USD de arriba dejaban sin
  // resultados a cualquier lead que cotiza en pesos en esas zonas) ---
  {
    externalRef: 'demo-013',
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
    externalRef: 'demo-014',
    title: '3 ambientes con cochera en Palermo Chico',
    operation: 'RENT',
    propertyType: 'departamento',
    price: 900000,
    currency: 'ARS',
    expenses: 95000,
    neighborhood: normalizeNeighborhood('Palermo'),
    rooms: 3,
    bedrooms: 2,
    bathrooms: 2,
    areaM2: 68,
    garage: true,
    features: ['cochera', 'amenities'],
  },
  {
    externalRef: 'demo-015',
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
    externalRef: 'demo-016',
    title: 'Monoambiente a nuevo en Caballito Sur',
    operation: 'RENT',
    propertyType: 'departamento',
    price: 300000,
    currency: 'ARS',
    expenses: 28000,
    neighborhood: normalizeNeighborhood('Caballito'),
    rooms: 1,
    bedrooms: 0,
    bathrooms: 1,
    areaM2: 27,
    garage: false,
    features: ['a estrenar'],
  },
  // --- Belgrano: rango medio en USD para leads de compra con 120-150k ---
  {
    externalRef: 'demo-017',
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
    externalRef: 'demo-018',
    title: '3 ambientes con cochera en Belgrano R, apto crédito',
    operation: 'SALE',
    propertyType: 'departamento',
    price: 148000,
    currency: 'USD',
    neighborhood: normalizeNeighborhood('Belgrano R'),
    rooms: 3,
    bedrooms: 2,
    bathrooms: 2,
    areaM2: 72,
    garage: true,
    features: ['cochera', 'apto crédito'],
  },
  // --- Recoleta: solo venta (a propósito, para probar zona vacía en alquiler) ---
  {
    externalRef: 'demo-019',
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
    externalRef: 'demo-020',
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
  // --- Núñez: mix RENT/SALE ---
  {
    externalRef: 'demo-021',
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
    externalRef: 'demo-022',
    title: '3 ambientes con cochera en Núñez, cerca de Libertador',
    operation: 'SALE',
    propertyType: 'departamento',
    price: 140000,
    currency: 'USD',
    neighborhood: normalizeNeighborhood('Nuñez'),
    rooms: 3,
    bedrooms: 2,
    bathrooms: 2,
    areaM2: 70,
    garage: true,
    features: ['cochera'],
  },
  // --- Flores: zona más económica, solo alquiler ---
  {
    externalRef: 'demo-023',
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
    externalRef: 'demo-024',
    title: '2 ambientes luminoso en Flores',
    operation: 'RENT',
    propertyType: 'departamento',
    price: 310000,
    currency: 'ARS',
    expenses: 25000,
    neighborhood: normalizeNeighborhood('Flores'),
    rooms: 2,
    bedrooms: 1,
    bathrooms: 1,
    areaM2: 40,
    garage: false,
    petsAllowed: true,
    features: ['luminoso'],
  },
  {
    externalRef: 'demo-025',
    title: 'PH con patio en Flores, admite mascotas',
    operation: 'RENT',
    propertyType: 'ph',
    price: 480000,
    currency: 'ARS',
    expenses: 15000,
    neighborhood: normalizeNeighborhood('Flores'),
    rooms: 3,
    bedrooms: 2,
    bathrooms: 1,
    areaM2: 62,
    garage: false,
    petsAllowed: true,
    features: ['patio'],
  },
  // --- Villa Devoto: mix RENT/SALE ---
  {
    externalRef: 'demo-026',
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
    externalRef: 'demo-027',
    title: '2 ambientes en Villa Devoto, no acepta mascotas',
    operation: 'RENT',
    propertyType: 'departamento',
    price: 400000,
    currency: 'ARS',
    expenses: 42000,
    neighborhood: normalizeNeighborhood('Villa Devoto'),
    rooms: 2,
    bedrooms: 1,
    bathrooms: 1,
    areaM2: 45,
    garage: false,
    petsAllowed: false,
    features: [],
  },
  // --- San Isidro (GBA norte): gama alta, solo venta ---
  {
    externalRef: 'demo-028',
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
  {
    externalRef: 'demo-029',
    title: 'Casa quinta con parque en San Isidro',
    operation: 'SALE',
    propertyType: 'casa',
    price: 550000,
    currency: 'USD',
    neighborhood: normalizeNeighborhood('San Isidro'),
    rooms: 5,
    bedrooms: 4,
    bathrooms: 3,
    areaM2: 320,
    garage: true,
    features: ['parque', 'pileta', 'quincho'],
  },
];

async function main() {
  const existingTenant = await prisma.tenant.findUnique({
    where: { slug: 'inmobiliaria-demo' },
  });

  // La API key sólo se genera (y se puede mostrar) al crear el tenant por primera vez;
  // en corridas posteriores el seed es idempotente y no rota el hash ya guardado.
  const demoApiKey = existingTenant
    ? null
    : `demo_${randomBytes(24).toString('hex')}`;
  const apiKeyHash = demoApiKey
    ? await argon2.hash(demoApiKey)
    : existingTenant!.apiKeyHash;

  const tenant = await prisma.tenant.upsert({
    where: { slug: 'inmobiliaria-demo' },
    update: {},
    create: {
      name: 'Inmobiliaria Demo',
      slug: 'inmobiliaria-demo',
      phoneNumberId: 'demo-phone-number-id-000',
      wabaId: 'demo-waba-id-000',
      accessTokenEnc: encrypt('demo-meta-access-token', APP_ENCRYPTION_KEY),
      displayPhone: '+54 9 11 5555-0000',
      botName: 'Sofía',
      botTone: 'cordial y profesional, voseo argentino',
      schedulingLink: 'https://calendly.com/inmobiliaria-demo/visita',
      humanHours: 'Lun a Vie 9 a 18',
      competitorsToAvoid: ['Remax', 'Zonaprop'],
      coverageAreas: [
        'palermo',
        'caballito',
        'belgrano',
        'villa urquiza',
        'recoleta',
        'nunez',
        'flores',
        'villa devoto',
        'san isidro',
      ],
      apiKeyHash,
    },
  });

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

  console.log('\nSeed completo.');

  console.log(`Tenant demo: ${tenant.name} (id: ${tenant.id})`);

  console.log(`phoneNumberId: ${tenant.phoneNumberId}`);

  console.log(
    demoApiKey
      ? `API key demo (guardala, no se vuelve a mostrar): ${demoApiKey}`
      : 'El tenant demo ya existía: la API key no se regenera (se mostró solo en la primera corrida del seed).',
  );

  console.log(`Propiedades cargadas: ${SEED_PROPERTIES.length}\n`);
}

main()
  .catch((error: unknown) => {
    console.error('Error corriendo el seed:', error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
