/**
 * Corre PropertySearchService.search() directo contra la DB (sin LLM, sin
 * NestJS bootstrap) con una batería de filtros representativos, para ver en
 * consola cómo filtra/relaja sobre los datos reales del tenant demo.
 *
 * Uso: npx ts-node scripts/inspect-search.ts
 */
import 'dotenv/config';
import { ConfigService } from '@nestjs/config';
import { OperationType } from '@prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  PropertySearchService,
  type SearchFilters,
} from '../src/properties/property-search.service';
import type { EnvConfig } from '../src/config/env.schema';

interface Case {
  label: string;
  filters: SearchFilters;
}

const CASES: Case[] = [
  {
    label: 'Alquiler en Palermo, hasta $650.000 ARS, 2 ambientes',
    filters: {
      operation: OperationType.RENT,
      neighborhoods: ['palermo'],
      maxPrice: 650000,
      currency: 'ARS',
      minRooms: 2,
      garage: null,
      petsAllowed: null,
    },
  },
  {
    label:
      'Alquiler en Palermo, mismo presupuesto pero en USD (no debe matchear los ARS)',
    filters: {
      operation: OperationType.RENT,
      neighborhoods: ['palermo'],
      maxPrice: 650000,
      currency: 'USD',
      minRooms: 2,
      garage: null,
      petsAllowed: null,
    },
  },
  {
    label:
      'Compra en Belgrano hasta USD 120.000 (dispara "price": +25% -> hasta 150.000)',
    filters: {
      operation: OperationType.SALE,
      neighborhoods: ['belgrano'],
      maxPrice: 120000,
      currency: 'USD',
      minRooms: null,
      garage: null,
      petsAllowed: null,
    },
  },
  {
    label:
      'Compra en Belgrano hasta USD 50.000 (nada ni relajando -> over_budget)',
    filters: {
      operation: OperationType.SALE,
      neighborhoods: ['belgrano'],
      maxPrice: 50000,
      currency: 'USD',
      minRooms: null,
      garage: null,
      petsAllowed: null,
    },
  },
  {
    label: 'Alquiler en Recoleta (zona sin stock de alquiler -> empty_zone)',
    filters: {
      operation: OperationType.RENT,
      neighborhoods: ['recoleta'],
      maxPrice: null,
      currency: null,
      minRooms: null,
      garage: null,
      petsAllowed: null,
    },
  },
  {
    label:
      'Alquiler en Caballito o Flores, admite mascotas, hasta $500.000 ARS',
    filters: {
      operation: OperationType.RENT,
      neighborhoods: ['caballito', 'flores'],
      maxPrice: 500000,
      currency: 'ARS',
      minRooms: null,
      garage: null,
      petsAllowed: true,
    },
  },
  {
    label:
      'Alquiler en Flores, 6 ambientes (nadie tiene tantos -> relaja "rooms")',
    filters: {
      operation: OperationType.RENT,
      neighborhoods: ['flores'],
      maxPrice: null,
      currency: null,
      minRooms: 6,
      garage: null,
      petsAllowed: null,
    },
  },
  {
    label: 'Compra en Villa Devoto o Núñez, con cochera',
    filters: {
      operation: OperationType.SALE,
      neighborhoods: ['villa devoto', 'nunez'],
      maxPrice: null,
      currency: null,
      minRooms: null,
      garage: true,
      petsAllowed: null,
    },
  },
];

function money(value: number, currency: string): string {
  return `${currency} ${value.toLocaleString('es-AR')}`;
}

async function main(): Promise<void> {
  const config = {
    get: () => process.env.DATABASE_URL,
  } as unknown as ConfigService<EnvConfig, true>;
  const prisma = new PrismaService(config);
  await prisma.onModuleInit();
  const service = new PropertySearchService(prisma);

  const tenant = await prisma.tenant.findUniqueOrThrow({
    where: { slug: 'inmobiliaria-demo' },
  });

  for (const testCase of CASES) {
    console.log(`\n${'='.repeat(72)}`);
    console.log(testCase.label);
    console.log('='.repeat(72));

    const outcome = await service.search(tenant.id, testCase.filters);

    console.log(`relaxed: ${outcome.relaxed ?? '(ninguno, match exacto)'}`);
    if (outcome.properties.length === 0) {
      console.log('  -> 0 resultados');
      continue;
    }
    outcome.properties.forEach((p, i) => {
      const roomsPart = p.rooms ? `${p.rooms} amb.` : 'amb. no especificado';
      const extras = [
        p.garage ? 'cochera' : null,
        p.petsAllowed ? 'pet friendly' : null,
      ]
        .filter(Boolean)
        .join(', ');
      console.log(
        `  ${i + 1}. ${p.title} — ${p.neighborhood} — ${money(Number(p.price), p.currency)} — ${roomsPart}${extras ? ` — ${extras}` : ''}`,
      );
    });
  }

  await prisma.$disconnect();
}

main().catch((error: unknown) => {
  console.error('Error corriendo inspect-search:', error);
  process.exitCode = 1;
});
