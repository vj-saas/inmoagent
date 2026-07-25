import React from 'react';

/**
 * Traducción de `OperationType` (prisma/schema.prisma) a texto en español.
 * Incluye `TEMP_RENT`, que ya existe hoy en el enum real (no es un caso
 * futuro hipotético).
 */
const OPERATION_LABELS: Record<string, string> = {
  SALE: 'Venta',
  RENT: 'Alquiler',
  TEMP_RENT: 'Alquiler temporario',
};

// Campos mínimos que este componente necesita del lead. Se definen acá en
// vez de importar `Lead` de `endpoints.ts` para no acoplar el componente a
// la forma completa del tipo (y evitar bloquear T7 si T5 todavía no está
// mergeado); los nombres coinciden con el modelo Prisma real.
export interface LeadChipsProps {
  fOperation?: string | null;
  fNeighborhoods?: string[] | null;
  fMaxPrice?: string | null;
  fCurrency?: string | null;
  fMinRooms?: number | null;
}

/**
 * Parsea `fMaxPrice` (Decimal de Prisma serializado como string) a number,
 * sin asumir que ya viene numérico. Devuelve `null` si no es parseable.
 */
function parseMaxPrice(fMaxPrice: string | null | undefined): number | null {
  if (fMaxPrice === null || fMaxPrice === undefined) return null;
  const parsed = Number(fMaxPrice);
  return Number.isFinite(parsed) ? parsed : null;
}

export const LeadChips: React.FC<LeadChipsProps> = ({
  fOperation,
  fNeighborhoods,
  fMaxPrice,
  fCurrency,
  fMinRooms,
}) => {
  const chips: string[] = [];

  if (fOperation) {
    chips.push(OPERATION_LABELS[fOperation] ?? fOperation);
  }

  if (fNeighborhoods && fNeighborhoods.length > 0) {
    chips.push(`Barrios: ${fNeighborhoods.join(', ')}`);
  }

  const parsedMaxPrice = parseMaxPrice(fMaxPrice);
  if (parsedMaxPrice !== null && fCurrency) {
    chips.push(`Hasta ${fCurrency} ${parsedMaxPrice.toLocaleString('es-AR')}`);
  }

  if (fMinRooms !== null && fMinRooms !== undefined) {
    chips.push(`${fMinRooms}+ ambientes`);
  }

  if (chips.length === 0) {
    return null;
  }

  return (
    <div data-testid="lead-chips" className="flex flex-wrap gap-2">
      {chips.map((chip) => (
        <span
          key={chip}
          data-testid="lead-chip"
          className="rounded-pill bg-info/10 px-2.5 py-1 text-xs leading-snug text-info"
        >
          {chip}
        </span>
      ))}
    </div>
  );
};
