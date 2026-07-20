import type { Lead } from '@prisma/client';
import type { ExtractionResult } from '../llm/extraction.schema';
import type { LeadFilters } from './conversation.types';

export function currentFiltersFrom(lead: Lead): LeadFilters {
  return {
    fOperation: lead.fOperation,
    fNeighborhoods: lead.fNeighborhoods,
    fMaxPrice: lead.fMaxPrice ? Number(lead.fMaxPrice) : null,
    fCurrency: lead.fCurrency,
    fMinRooms: lead.fMinRooms,
    fGarage: lead.fGarage,
    fPetsAllowed: lead.fPetsAllowed,
    fNotes: lead.fNotes,
    fOfferedNeighborhoods: lead.fOfferedNeighborhoods,
    fPriceMentionedAtTurn: lead.fPriceMentionedAtTurn,
  };
}

/**
 * Actualiza los filtros del lead con lo que se extrajo en este turno: merge
 * por default; con intent `change_filters` explícito, los barrios se
 * reemplazan en vez de acumularse (docs/03-CONVERSACION.md §4.1).
 */
export function mergeFilters(
  current: LeadFilters,
  extraction: ExtractionResult,
): LeadFilters {
  const replaceNeighborhoods = extraction.intent === 'change_filters';

  return {
    fOperation: extraction.operation ?? current.fOperation,
    fNeighborhoods:
      extraction.neighborhoods.length === 0
        ? current.fNeighborhoods
        : replaceNeighborhoods
          ? extraction.neighborhoods
          : [
              ...new Set([
                ...current.fNeighborhoods,
                ...extraction.neighborhoods,
              ]),
            ],
    fMaxPrice: extraction.maxPrice ?? current.fMaxPrice,
    fCurrency: extraction.currency ?? current.fCurrency,
    fMinRooms: extraction.minRooms ?? current.fMinRooms,
    fGarage: extraction.wantsGarage ?? current.fGarage,
    fPetsAllowed: extraction.wantsPetsAllowed ?? current.fPetsAllowed,
    fNotes: extraction.extraRequirements ?? current.fNotes,
    // No se deriva de la extracción del LLM: lo maneja explícitamente el
    // handler de calificación (oferta pendiente de zonas aledañas, §4).
    fOfferedNeighborhoods: current.fOfferedNeighborhoods,
    // Tampoco se deriva acá: lo actualiza explícitamente ConversationEngine
    // (necesita el turnCount de ESTE turno, que todavía no existe en este punto).
    fPriceMentionedAtTurn: current.fPriceMentionedAtTurn,
  };
}

export type MissingFilter = 'neighborhood' | 'price' | 'rooms';

export function countFilledCoreFilters(filters: LeadFilters): number {
  return [
    filters.fNeighborhoods.length > 0,
    filters.fMaxPrice !== null,
    filters.fMinRooms !== null,
  ].filter(Boolean).length;
}

export function firstMissingFilter(filters: LeadFilters): MissingFilter {
  // Orden natural de una inmobiliaria: zona → ambientes → presupuesto
  // (el presupuesto va último; se pregunta recién si falta lo demás).
  if (filters.fNeighborhoods.length === 0) return 'neighborhood';
  if (filters.fMinRooms === null) return 'rooms';
  return 'price';
}

const SATURDAY_PATTERN = /\bs[áa]bados?\b/i;
const WEEKDAY_PATTERN =
  /entre semana|lunes|martes|mi[ée]rcoles|jueves|viernes|entre-semana|dia de semana|día de semana/i;

/**
 * Preferencia de día para la visita (§5.2): parseo determinístico por
 * keywords (NO vía LLM) — es un dato operativo que se le pasa al asesor
 * humano, no algo que valga la pena arriesgar a una alucinación del modelo.
 */
export function extractDayPreference(text: string): string | null {
  if (SATURDAY_PATTERN.test(text)) return 'sábado';
  if (WEEKDAY_PATTERN.test(text)) return 'entre semana';
  return null;
}

const ACCEPTANCE_PATTERN =
  /^\s*(dale|s[ií]|si\b|bueno|joya|de una|ok(ay)?|va\b|genial|mostrame|mostrá|mostra|perfecto|buenisimo|buenísimo|listo)\b/i;

/**
 * ¿El lead acepta la sugerencia de zonas aledañas del turno anterior? (§4).
 * Parseo determinístico por keywords: es una decisión de flujo (qué zona
 * buscar), no algo que dejemos en manos de una alucinación del LLM.
 */
export function acceptsZoneSuggestion(text: string): boolean {
  return ACCEPTANCE_PATTERN.test(text.trim());
}

/**
 * Unidades/sustantivos que hacen que un número suelto NO sea el número de una
 * ficha ("2 amb", "2 hijos", "hasta 600"): evita agendar visitas por error.
 */
const NUMBER_UNIT_PATTERN =
  /\b[1-9]\d?\s*(amb\b|ambientes?|dormitorios?|habitaciones?|cuartos?|ba[ñn]os?|personas?|hij[oa]s?|nen[ea]s?|chic[oa]s?|a[ñn]os?|lucas?|luca\b|palos?|mil\b|millon(es)?|k\b|usd\b|d[oó]lares?|pesos?|m2\b|mts?\b|metros?|cuadras?|pisos?|autos?|cocheras?)/i;

const PROPERTY_CHOICE_PATTERNS = [
  // "la 2", "el 1", "opción 3", "número 2", "la numero 1"
  /\b(la|el|opci[oó]n|n[uú]mero|nro\.?)\s*[1-9]\b/i,
  // Ordinales: "la primera", "el segundo", "tercera opción"
  /\b(primer[oa]?|segund[oa]|tercer[oa]?|[123]\s*(er[oa]?|d[oa]|r[oa]))\b/i,
  // Deícticos: "esa", "este", "aquella" (referencia a una ficha ya mostrada)
  /\b(es[ea]|est[ea]|aquell[ao])\b/i,
  // Verbos de interés/visita
  /me\s+(interesa|gusta|copa|encanta|cierra|sirve|convence)/i,
  /quiero\s+(verl[oa]|visitarl[oa]|conocerl[oa]|ir a verl[oa]|agendar)/i,
  // Cualquier mención de visitar ("coordiname una visita", "puedo ir a verla",
  // "can I visit"): con un índice del LLM de por medio, es interés real.
  /\bvisit(a|as|ar|arla|arlo|o)?\b/i,
  /\bla\s+(quiero|veo|visito|alquilo|compro)\b/i,
  // "la del balcón", "el de la foto", "la con patio"
  /\b(el|la)\s+(del?\s|de la\s|con\s)/i,
  // Inglés básico (leads extranjeros): "the first one", "I like", "visit"
  /\b(first|second|third|that one|this one)\b/i,
  /\bi\s+(like|love|want|prefer)\b/i,
];

/**
 * ¿El texto del lead realmente refiere a una de las fichas mostradas? Guardrail
 * determinístico contra falsos positivos de `interestedPropertyIndex` del LLM
 * ("dale mostrame" o "2 amb estaria joya" NO son interés en la ficha 1): sin
 * esto, un lead que solo pedía ver opciones terminaba con visita agendada y el
 * bot silenciado en HUMAN_HANDOFF (QA personas §1).
 */
export function confirmsPropertyChoice(text: string): boolean {
  const cleaned = text
    .replace(NUMBER_UNIT_PATTERN, ' ')
    // "somos 2", "para 3", "hasta 900": números que no nombran una ficha
    .replace(
      /\b(somos|para|con|tenemos|hasta|m[aá]ximo|max)\s+[1-9]\d*\b/gi,
      ' ',
    );
  // Número suelto que sobrevivió a la limpieza ("la 2", "el 1", "2")
  if (/\b[1-9]\b/.test(cleaned)) {
    return true;
  }
  return PROPERTY_CHOICE_PATTERNS.some((pattern) => pattern.test(text));
}

const ZONE_DELEGATION_PATTERN =
  /me da igual|cualquier (barrio|zona|lado|lugar)|cualquiera me|donde sea|no tengo preferencia|no s[ée] (qu[ée] )?(barrio|zona)|recomend(a|á|ame|ás|as|ame algo)|vos qu[ée]|qu[ée] me recomend|lo que (haya|tengas)|donde (haya|tengas)|el que sea|la que sea/i;

/**
 * ¿El lead delega la elección de zona ("me da igual, vos qué me recomendás")?
 * Sin esto, el bot repetía "¿qué barrio te gustaría?" en loop (QA personas §6).
 */
export function delegatesZoneChoice(text: string): boolean {
  return ZONE_DELEGATION_PATTERN.test(text);
}

/**
 * Turnos de "gracia" desde la última mención de precio/moneda antes de dejar
 * de aplicarlos a una búsqueda nueva. Ver `isPriceStale` — sin esto, un
 * presupuesto dicho hace muchos turnos (o en una sesión de prueba anterior
 * sobre un lead reutilizado) queda pegado para siempre y termina tapando
 * stock real en otra moneda o rango de precio en una consulta que ya no
 * tiene nada que ver con esa cifra.
 */
export const STALE_PRICE_TURNS = 3;

/**
 * ¿El fMaxPrice/fCurrency guardado es demasiado viejo como para seguir
 * aplicándolo en una búsqueda sin que el lead lo haya reafirmado? Solo mira
 * turnos (no tiempo real): una ráfaga de mensajes rápidos no debería invalidar
 * un presupuesto recién dicho, y un lead que vuelve después de días pero seguí
 * hablando de lo mismo tampoco debería tener que repetirlo.
 *
 * Si `fPriceMentionedAtTurn` es null (leads de antes de que existiera este
 * campo, o nunca se trackeó por algún motivo) se asume NO stale: mejor un
 * falso negativo ocasional que invalidar de golpe presupuestos legítimos sin
 * evidencia de que sean viejos.
 */
export function isPriceStale(
  filters: LeadFilters,
  currentTurnCount: number,
): boolean {
  if (filters.fMaxPrice === null) return false;
  if (filters.fPriceMentionedAtTurn === null) return false;
  return currentTurnCount - filters.fPriceMentionedAtTurn > STALE_PRICE_TURNS;
}

export function hasNewFilterData(extraction: ExtractionResult): boolean {
  return (
    extraction.operation !== null ||
    extraction.neighborhoods.length > 0 ||
    extraction.maxPrice !== null ||
    extraction.minRooms !== null ||
    extraction.wantsGarage !== null ||
    extraction.wantsPetsAllowed !== null
  );
}
