import { BadRequestException, Injectable } from '@nestjs/common';
import { OperationType } from '@prisma/client';
import { parseCsv } from './csv-parser.util';
import {
  PropertiesAdminService,
  type UpsertPropertyInput,
} from './properties-admin.service';

const REQUIRED_COLUMNS = [
  'external_ref',
  'title',
  'description',
  'operation',
  'property_type',
  'price',
  'currency',
  'expenses',
  'neighborhood',
  'city',
  'address',
  'rooms',
  'bedrooms',
  'bathrooms',
  'area_m2',
  'garage',
  'pets_allowed',
  'features',
  'listing_url',
  'photo_urls',
] as const;

const OPERATION_MAP: Record<string, OperationType> = {
  venta: OperationType.SALE,
  alquiler: OperationType.RENT,
  temporario: OperationType.TEMP_RENT,
};

export interface CsvImportError {
  row: number;
  message: string;
}

export interface CsvImportResult {
  imported: number;
  errors: CsvImportError[];
}

type ParsedRow =
  { ok: true; data: UpsertPropertyInput } | { ok: false; error: string };

/** Import de inventario vía CSV (docs/05-OPERACIONES.md §4). Fila con error no aborta el resto del batch. */
@Injectable()
export class CsvImportService {
  constructor(private readonly properties: PropertiesAdminService) {}

  async import(tenantId: string, csvText: string): Promise<CsvImportResult> {
    const rows = parseCsv(csvText);
    if (rows.length === 0) {
      return { imported: 0, errors: [] };
    }

    const header = rows[0].map((h) => h.trim());
    const missingColumns = REQUIRED_COLUMNS.filter(
      (column) => !header.includes(column),
    );
    if (missingColumns.length > 0) {
      throw new BadRequestException(
        `Faltan columnas obligatorias en el CSV: ${missingColumns.join(', ')}`,
      );
    }

    let imported = 0;
    const errors: CsvImportError[] = [];

    for (let i = 1; i < rows.length; i++) {
      const rowNumber = i + 1; // 1-indexado incluyendo la fila de encabezado
      const record = this.toRecord(header, rows[i]);
      const parsed = this.parseRow(record);

      if (!parsed.ok) {
        errors.push({ row: rowNumber, message: parsed.error });
        continue;
      }

      try {
        await this.properties.upsertByExternalRef(tenantId, parsed.data);
        imported++;
      } catch (error) {
        errors.push({
          row: rowNumber,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return { imported, errors };
  }

  private toRecord(header: string[], row: string[]): Record<string, string> {
    const record: Record<string, string> = {};
    header.forEach((column, index) => {
      record[column] = (row[index] ?? '').trim();
    });
    return record;
  }

  private parseRow(record: Record<string, string>): ParsedRow {
    const externalRef = record.external_ref;
    if (!externalRef) {
      return { ok: false, error: 'external_ref es obligatorio' };
    }
    const title = record.title;
    if (!title) {
      return { ok: false, error: 'title es obligatorio' };
    }
    const operation = OPERATION_MAP[record.operation.toLowerCase()];
    if (!operation) {
      return {
        ok: false,
        error: `operation inválida: "${record.operation}" (debe ser venta|alquiler|temporario)`,
      };
    }
    const propertyType = record.property_type;
    if (!propertyType) {
      return { ok: false, error: 'property_type es obligatorio' };
    }
    const price = Number(record.price);
    if (!record.price || Number.isNaN(price) || price <= 0) {
      return { ok: false, error: `price inválido: "${record.price}"` };
    }
    const neighborhood = record.neighborhood;
    if (!neighborhood) {
      return { ok: false, error: 'neighborhood es obligatorio' };
    }

    const expenses = record.expenses ? Number(record.expenses) : undefined;
    if (record.expenses && Number.isNaN(expenses)) {
      return { ok: false, error: `expenses inválido: "${record.expenses}"` };
    }

    const intFields: Array<[label: string, raw: string]> = [
      ['rooms', record.rooms],
      ['bedrooms', record.bedrooms],
      ['bathrooms', record.bathrooms],
      ['area_m2', record.area_m2],
    ];
    const invalidIntField = intFields.find(
      ([, raw]) => raw && !Number.isInteger(Number(raw)),
    );
    if (invalidIntField) {
      return {
        ok: false,
        error: `${invalidIntField[0]} inválido: "${invalidIntField[1]}" (debe ser un entero)`,
      };
    }
    const rooms = this.parseOptionalInt(record.rooms);
    const bedrooms = this.parseOptionalInt(record.bedrooms);
    const bathrooms = this.parseOptionalInt(record.bathrooms);
    const areaM2 = this.parseOptionalInt(record.area_m2);

    return {
      ok: true,
      data: {
        externalRef,
        title,
        description: record.description || undefined,
        operation,
        propertyType,
        price,
        currency: record.currency || undefined,
        expenses,
        neighborhood,
        city: record.city || undefined,
        address: record.address || undefined,
        rooms,
        bedrooms,
        bathrooms,
        areaM2,
        garage: this.parseSiNo(record.garage),
        petsAllowed: this.parseSiNo(record.pets_allowed),
        features: this.parseList(record.features),
        listingUrl: record.listing_url || undefined,
        photoUrls: this.parseList(record.photo_urls),
      },
    };
  }

  /** Ya se validó que, si hay valor, es un entero; acá sólo convierte. */
  private parseOptionalInt(value: string): number | undefined {
    return value ? Number(value) : undefined;
  }

  private parseSiNo(value: string | undefined): boolean | undefined {
    const normalized = value?.trim().toLowerCase();
    if (normalized === 'si' || normalized === 'sí') return true;
    if (normalized === 'no') return false;
    return undefined;
  }

  private parseList(value: string | undefined): string[] | undefined {
    if (!value) return undefined;
    const items = value
      .split(';')
      .map((item) => item.trim())
      .filter(Boolean);
    return items.length > 0 ? items : undefined;
  }
}
