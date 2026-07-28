import { z } from 'zod';
import {
  isKnownNeighborhood,
  normalizeNeighborhood,
  normalizeText,
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
  /** true = el lead dijo que puede pagar más SIN dar una cifra nueva (ej. "me puedo estirar", "y más caro no tenés?"). */
  priceFlexible: z.boolean(),
  extraRequirements: z.string().nullable(),
  interestedPropertyIndex: z.number().int().positive().nullable(),
  /** Nombre del lead, SOLO si se presentó explícitamente en este turno (spec 09, T1.1). */
  name: z.string().nullable(),
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
  /** true = el lead ofreció flexibilidad de presupuesto este turno sin dar una cifra nueva. */
  priceFlexible: boolean;
  /** Incluye lo que puso el LLM más los barrios no reconocidos (en texto libre). */
  extraRequirements: string | null;
  interestedPropertyIndex: number | null;
  /** Nombre del lead, ya validado contra el texto del turno (ver `sanitizeLeadName`). */
  name: string | null;
}

const MAX_ROOMS = 10;
const MIN_NAME_LENGTH = 2;
const MAX_NAME_LENGTH = 40;

/**
 * Palabras que el LLM confunde con un nombre propio (saludos, muletillas,
 * confirmaciones cortas). Lista cerrada y normalizada (minúsculas, sin
 * tildes) — spec 09, T1.1 AC-16.
 */
const NAME_BLACKLIST = new Set([
  'hola',
  'buenas',
  'buenos dias',
  'buenas tardes',
  'buenas noches',
  'gracias',
  'chau',
  'listo',
  'dale',
  'si',
  'no',
  'ok',
  'okay',
  'genial',
  'joya',
  'buenisimo',
  'perfecto',
  'hey',
  'che',
]);

function capitalizeEachWord(text: string): string {
  return text
    .split(' ')
    .map((word) => (word ? word.charAt(0).toUpperCase() + word.slice(1) : word))
    .join(' ');
}

/**
 * El LLM alucina nombres con frecuencia (saluda "Hola!" y a veces devuelve
 * "Hola" como `name`, o repite el nombre del bot). Un candidato solo se
 * acepta si:
 * - aparece mencionado en el TEXTO de este turno (mismo criterio tolerante a
 *   typos que `textMentionsNeighborhood`, reutilizado tal cual: no es
 *   específico de barrios, solo compara palabras);
 * - tiene un largo plausible para un nombre (2 a 40 caracteres);
 * - no es una palabra de la lista negra (saludos/muletillas/confirmaciones);
 * - no es, él mismo, un barrio conocido ("Recoleta" no es un nombre).
 * Spec 09, T1.1, AC-15/AC-16.
 */
export function sanitizeLeadName(
  rawName: string | null,
  turnText: string,
): string | null {
  if (!rawName) return null;
  const trimmed = rawName.trim();
  if (trimmed.length < MIN_NAME_LENGTH || trimmed.length > MAX_NAME_LENGTH) {
    return null;
  }
  const normalized = normalizeText(trimmed);
  if (NAME_BLACKLIST.has(normalized)) return null;
  if (isKnownNeighborhood(trimmed)) return null;
  if (!textMentionsNeighborhood(turnText, trimmed)) return null;
  return capitalizeEachWord(trimmed);
}

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
    priceFlexible: raw.priceFlexible,
    extraRequirements: extraRequirements ? extraRequirements : null,
    interestedPropertyIndex: raw.interestedPropertyIndex,
    name: sanitizeLeadName(raw.name, turnText),
  };
}
