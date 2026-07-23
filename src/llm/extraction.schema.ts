import { z } from 'zod';
import {
  normalizeNeighborhood,
  textMentionsNeighborhood,
} from '../properties/neighborhoods';

/** Forma cruda que le pedimos al LLM, ver docs/03-CONVERSACION.md §4.1. */
export const rawExtractionSchema = z.object({
  intent: z.enum([
    'provide_info',
    'ask_question',
    'show_interest',
    'change_filters',
    'schedule_visit',
    'off_topic',
    'other',
  ]),
  operation: z.enum(['SALE', 'RENT', 'TEMP_RENT']).nullable(),
  neighborhoods: z.array(z.string()).default([]),
  maxPrice: z.number().nullable(),
  currency: z.enum(['USD', 'ARS']).nullable(),
  minRooms: z.number().nullable(),
  wantsGarage: z.boolean().nullable(),
  wantsPetsAllowed: z.boolean().nullable(),
  /** true = minRooms se dedujo de la composición familiar, no de un número explícito (§6). */
  roomsInferred: z.boolean(),
  extraRequirements: z.string().nullable(),
  interestedPropertyIndex: z.number().int().positive().nullable(),
});

export type RawExtraction = z.infer<typeof rawExtractionSchema>;

export interface ExtractionResult {
  intent: RawExtraction['intent'];
  operation: RawExtraction['operation'];
  /** Ya normalizados (minúsculas, sin tildes) y filtrados contra el diccionario conocido. */
  neighborhoods: string[];
  maxPrice: number | null;
  currency: RawExtraction['currency'];
  minRooms: number | null;
  /** true = pidió cochera explícitamente, false = dijo que no la necesita, null = no lo mencionó. */
  wantsGarage: boolean | null;
  wantsPetsAllowed: boolean | null;
  roomsInferred: boolean;
  /** Incluye lo que puso el LLM más los barrios no reconocidos (en texto libre). */
  extraRequirements: string | null;
  interestedPropertyIndex: number | null;
}

const MAX_ROOMS = 10;

/**
 * Valores fuera de rango se descartan (no invalidan toda la extracción):
 * precio ≤ 0, rooms > 10. Los barrios/zonas que extrae el LLM se aceptan tal
 * cual (normalizados, con alias resueltos vía `normalizeNeighborhood`): se
 * confía en el LLM para reconocer la zona. Si la zona no tiene stock, el flujo
 * lo maneja avisando al lead (ver PropertySearchService: 'empty_zone'), en vez
 * de rechazar la zona de entrada.
 *
 * Guardrail contra un bug real observado en producción: pese a que el prompt
 * pide extraer solo lo dicho en ESTE turno, el LLM a veces re-lista barrios
 * de turnos anteriores (incluso ya descartados por falta de stock), haciendo
 * que resuciten al mezclarse con los filtros vigentes. Un barrio solo se
 * acepta si aparece mencionado (tal cual lo devolvió el LLM, antes de
 * resolver alias, tolerando typos vía `textMentionsNeighborhood`) en el TEXTO
 * de este turno; si no, se descarta silenciosamente (el sistema ya tiene
 * guardado el barrio si de verdad seguía vigente).
 */
export function sanitizeExtraction(
  raw: RawExtraction,
  turnText: string,
): ExtractionResult {
  const neighborhoods = raw.neighborhoods
    .filter((neighborhood) => textMentionsNeighborhood(turnText, neighborhood))
    .map((neighborhood) => normalizeNeighborhood(neighborhood))
    .filter((neighborhood) => neighborhood.length > 0);

  const extraRequirements = raw.extraRequirements?.trim();

  return {
    intent: raw.intent,
    operation: raw.operation,
    neighborhoods: [...new Set(neighborhoods)],
    maxPrice: raw.maxPrice !== null && raw.maxPrice > 0 ? raw.maxPrice : null,
    currency: raw.currency,
    minRooms:
      raw.minRooms !== null && raw.minRooms >= 1 && raw.minRooms <= MAX_ROOMS
        ? raw.minRooms
        : null,
    wantsGarage: raw.wantsGarage,
    wantsPetsAllowed: raw.wantsPetsAllowed,
    roomsInferred: raw.roomsInferred,
    extraRequirements: extraRequirements ? extraRequirements : null,
    interestedPropertyIndex: raw.interestedPropertyIndex,
  };
}
