import type { Lead, Tenant } from '@prisma/client';
import type { PropertyWithPhotos } from '../properties/property-search.service';
import type { MissingFilter } from './filters.util';
import { pickVariant } from './copy-variants.util';

const OPERATION_LABEL: Record<string, string> = {
  SALE: 'compra',
  RENT: 'alquiler',
  TEMP_RENT: 'alquiler temporario',
};

interface FilterSummarySource {
  fOperation: string | null;
  fNeighborhoods: string[];
  fMaxPrice: number | null;
  fCurrency: string | null;
  fMinRooms: number | null;
}

/** Base compartida por `summarizeLeadFilters` (alerta interna) y
 * `buildUnderstandingEcho` (T2.5): arma la lista de filtros conocidos, en el
 * mismo orden y formato, sin repetir la lógica en dos lugares. */
function formatFiltersSummary(source: FilterSummarySource): string[] {
  const parts: string[] = [];
  if (source.fOperation)
    parts.push(OPERATION_LABEL[source.fOperation] ?? source.fOperation);
  if (source.fNeighborhoods.length > 0)
    parts.push(`en ${source.fNeighborhoods.map(capitalize).join(', ')}`);
  if (source.fMaxPrice)
    parts.push(
      `hasta ${source.fCurrency ?? ''} ${source.fMaxPrice.toLocaleString('es-AR')}`.trim(),
    );
  if (source.fMinRooms) parts.push(`${source.fMinRooms}+ amb.`);
  return parts;
}

/** Resumen legible de los filtros del lead, para la notificación interna al tenant. */
export function summarizeLeadFilters(lead: Lead): string {
  const parts = formatFiltersSummary({
    fOperation: lead.fOperation,
    fNeighborhoods: lead.fNeighborhoods,
    fMaxPrice: lead.fMaxPrice ? Number(lead.fMaxPrice) : null,
    fCurrency: lead.fCurrency,
    fMinRooms: lead.fMinRooms,
  });
  return parts.length > 0 ? parts.join(', ') : 'sin filtros definidos todavía';
}

/**
 * Eco de comprensión (spec 09, T2.5): antes de mostrar las fichas de la
 * primera búsqueda completa, resume en una línea lo que el sistema entendió.
 * Se arma SIEMPRE de los filtros ya persistidos (`LeadFilters`), nunca del
 * LLM (AC-13): mismo criterio que el resto del copy determinístico.
 */
export function buildUnderstandingEcho(source: FilterSummarySource): string {
  const parts = formatFiltersSummary(source);
  if (parts.length === 0) {
    return 'Entonces, buscamos algo a tu medida. ¿Es así?';
  }
  return `Entonces buscamos ${parts.join(', ')}. ¿Es así?`;
}

/** Mensajes 100% deterministos (sin LLM) — docs/03-CONVERSACION.md. */

/**
 * Frase introductoria por defecto del saludo (la que un tenant puede reemplazar
 * con `welcomeIntro`). Se exporta para que los tests verifiquen la regresión
 * contra un valor único en vez de contra un string copiado.
 */
export function DEFAULT_INTRO(tenant: Tenant): string {
  return `¡Hola! 👋 Soy ${tenant.botName}, de ${tenant.name}. Estoy para ayudarte a encontrar tu próxima propiedad, a cualquier hora.`;
}

/** Pregunta de operación del saludo: la agrega SIEMPRE el backend, no es configurable. */
export const OPERATION_QUESTION =
  'Contame, ¿estás buscando *comprar* o *alquilar*?';

/**
 * Aviso de tratamiento de datos (Ley 25.326) — regla de negocio innegociable 5.
 *
 * GUARDRAIL: se deriva únicamente de `tenant.name`, NUNCA del texto configurable
 * por el tenant, y `buildGreetingMessage` lo concatena en la misma (y única)
 * expresión de retorno. No existe ninguna rama de código que pueda omitirlo.
 */
function buildPrivacyLine(tenant: Tenant): string {
  return `_Al continuar aceptás que ${tenant.name} use tus datos solo para gestionar tu consulta (Ley 25.326). Escribí BAJA cuando quieras dejar de recibir mensajes._`;
}

/**
 * Primer mensaje al lead. `welcomeIntro` (configurable por el tenant) reemplaza
 * SOLO la frase introductoria: la pregunta de operación y el aviso de Ley 25.326
 * los agrega siempre el backend, sin importar el contenido configurado (AC-5,
 * AC-6, AC-7; regla de negocio innegociable 5 de CLAUDE.md).
 */
export function buildGreetingMessage(tenant: Tenant): string {
  const intro = tenant.welcomeIntro?.trim() || DEFAULT_INTRO(tenant);
  const privacyLine = buildPrivacyLine(tenant);
  return `${intro}\n\n${OPERATION_QUESTION}\n\n${privacyLine}`;
}

/** Repregunta de operación cuando el saludo completo ya se mandó antes (no repetirlo íntegro). */
export const OPERATION_FOLLOWUP_FALLBACK = '¿Buscás *comprar* o *alquilar*?';

export const OPT_OUT_CONFIRMATION =
  'Listo, no te escribimos más. Si algún día retomás la búsqueda, escribinos y seguimos donde quedamos.';

/**
 * Frase introductoria por defecto del handoff genérico (la que un tenant puede
 * reemplazar con `handoffIntro`). Exportada como referencia para los tests.
 */
export function DEFAULT_HANDOFF_INTRO(tenant: Tenant): string {
  return `¡Claro! Te dejo con un asesor de ${tenant.name}, te escribe a la brevedad.`;
}

/**
 * Handoff genérico a humano. `handoffIntro` reemplaza SOLO la frase
 * introductoria; la línea de `humanHours` la sigue agregando el backend (AC-8).
 */
export function buildHandoffFarewell(tenant: Tenant): string {
  const intro = tenant.handoffIntro?.trim() || DEFAULT_HANDOFF_INTRO(tenant);
  const hoursLine = tenant.humanHours
    ? ` Horario de atención: ${tenant.humanHours}.`
    : '';
  return `${intro}${hoursLine}`;
}

/** Handoff post-interés en una propiedad: baja el peso de la decisión (§5.4). */
export function buildSchedulingHandoffMessage(tenant: Tenant): string {
  const hoursLine = tenant.humanHours
    ? ` (horario de atención: ${tenant.humanHours})`
    : '';
  return `Cuando elijas el horario en el link, un asesor de ${tenant.name} se va a comunicar para confirmar la visita y contarte más opciones de la zona. Es sin compromiso y dura unos 20 minutos${hoursLine}.`;
}

export const HANDOFF_TIMEOUT_APOLOGY =
  'Perdón la demora en retomar, seguimos por acá. ¿En qué te puedo ayudar?';

/** Pools de variantes (spec 09, T2.2): mismo `seed` → mismo texto, pero nunca
 * el mismo turno tras turno para el mismo lead (ver `pickVariant`). */
const REFORMULATE_REQUEST_VARIANTS = [
  'Perdón, no te terminé de entender. ¿Me lo podés contar de otra forma?',
  'Disculpá, no me quedó claro. ¿Me lo explicás de otra manera?',
  'Perdón, no entendí bien eso. ¿Podés decírmelo con otras palabras?',
];

export function buildReformulateRequest(seed: string): string {
  return pickVariant(REFORMULATE_REQUEST_VARIANTS, seed);
}

const SEARCH_INTRO_VARIANTS = [
  'Encontré estas opciones para vos:',
  'Mirá lo que tengo para mostrarte:',
  'Estas son las opciones que encontré:',
  'Te paso lo que hay disponible:',
];

export function buildSearchIntro(seed: string): string {
  return pickVariant(SEARCH_INTRO_VARIANTS, seed);
}

/** "Mirá, en Palermo tengo estas opciones para que te des una idea:" (§3, búsqueda teaser). */
export function buildTeaserIntro(neighborhoods: string[], seed: string): string {
  const zone =
    neighborhoods.length > 0
      ? neighborhoods.map(capitalize).join(' y ')
      : 'esa zona';
  const variants = [
    `Mirá, en ${zone} tengo estas opciones para que te des una idea:`,
    `Estas son algunas opciones que encontré en ${zone}:`,
    `En ${zone} tengo esto para mostrarte:`,
  ];
  return pickVariant(variants, seed);
}

/** Excepción a "una pregunta por mensaje": el lead ya vio valor (§3, punto 4). */
export function buildTeaserClosingQuestion(count: number): string {
  const opener =
    count === 1 ? '¿Va por ahí lo que buscás?' : '¿Alguna va por ahí?';
  return `${opener} Para afinarte la búsqueda decime hasta cuánto es tu presupuesto y cuántos ambientes necesitás.`;
}

/**
 * Pedido de nombre (spec 09, T1.1, AC-17/AC-19): se pregunta en un mensaje
 * APARTE, recién después de mostrar valor real (teaser o primera búsqueda
 * completa) — nunca en el saludo. Se pregunta una sola vez (controlado por
 * `Lead.nameAskedAt`, mismo patrón que `greetedAt`).
 */
const NAME_REQUEST_VARIANTS = [
  'Antes de seguir, ¿cómo es tu nombre?',
  '¿Me decís tu nombre para ir llamándote mejor?',
  '¿Con quién tengo el gusto?',
];

export function buildNameRequestMessage(seed: string): string {
  return pickVariant(NAME_REQUEST_VARIANTS, seed);
}

/** Campos de calificación comercial que se pueden preguntar (spec 09, T1.4). */
export type CommercialField =
  | 'guarantee'
  | 'timeline'
  | 'paymentMethod'
  | 'hasPropertyToSell';

const COMMERCIAL_QUESTION_VARIANTS: Record<CommercialField, string[]> = {
  guarantee: [
    '¿Con qué garantía contás: propietaria, seguro de caución, o recibo de sueldo?',
    '¿Tenés garantía propietaria, de caución, o vas a garantizar con recibo de sueldo?',
  ],
  timeline: [
    '¿Para cuándo necesitás mudarte?',
    '¿Tenés fecha pensada para la mudanza, o todavía estás viendo opciones?',
  ],
  paymentMethod: [
    '¿Vas a pagar de contado o necesitás crédito hipotecario?',
    '¿Es una compra de contado o vas a necesitar crédito?',
  ],
  hasPropertyToSell: [
    '¿Tenés que vender o rescindir algo antes de mudarte?',
    '¿Dependés de vender una propiedad tuya para poder comprar esta?',
  ],
};

/**
 * Una sola pregunta comercial por mensaje (spec 09, T1.4, AC-28): la decide
 * `CommercialQualificationHandler` según la operación y lo que todavía falta
 * (`Lead.qAskedFields`), nunca el LLM.
 */
export function buildCommercialQuestion(
  field: CommercialField,
  seed: string,
): string {
  return pickVariant(COMMERCIAL_QUESTION_VARIANTS[field], seed);
}

/**
 * Una sola pregunta por mensaje (spec 09, T2.3): la preferencia de día se
 * pregunta recién al confirmar interés (ver `buildDayPreferenceQuestion`,
 * usado por `SchedulingHandler.enterScheduling`), no acá.
 */
const SEARCH_CLOSING_SINGLE_VARIANTS = [
  '¿Te interesa? Te coordino una visita 🙂',
  '¿Te copó esta opción? Te ayudo a coordinar la visita.',
  '¿Te cierra esta? Coordinamos la visita cuando quieras.',
];

const SEARCH_CLOSING_MULTI_VARIANTS = [
  '¿Cuál te gustó más? Decime el número y te coordino una visita.',
  '¿Alguna te cerró? Decime el número y arreglamos la visita.',
  '¿Cuál te gusta más? Pasame el número y coordinamos la visita.',
];

export function buildSearchClosingQuestion(count: number, seed: string): string {
  const variants =
    count === 1 ? SEARCH_CLOSING_SINGLE_VARIANTS : SEARCH_CLOSING_MULTI_VARIANTS;
  return pickVariant(variants, seed);
}

/**
 * Se pregunta recién cuando el lead confirma interés en una ficha, no antes
 * (spec 09, T2.3 AC-7): antes vivía pegada a `buildSearchClosingQuestion`,
 * violando la regla de una sola pregunta por mensaje (dos "?" en el mismo
 * texto, AC-8).
 */
const DAY_PREFERENCE_VARIANTS = [
  '¿Te queda mejor *entre semana* o el *sábado*?',
  '¿Preferís *entre semana* o el *sábado* para la visita?',
  '¿Mejor *entre semana* o *sábado* para coordinar?',
];

export function buildDayPreferenceQuestion(seed: string): string {
  return pickVariant(DAY_PREFERENCE_VARIANTS, seed);
}

/**
 * El lead delegó la elección de zona ("me da igual, vos qué me recomendás"):
 * en vez de repetir la pregunta de barrio en loop (QA personas §6), se le
 * ofrecen las zonas con más movimiento y quedan pendientes de aceptación
 * en fOfferedNeighborhoods (mismo mecanismo que §4).
 */
export function buildDelegatedZoneMessage(suggestions: string[]): string {
  const named = suggestions.map((s) => `*${capitalize(s)}*`);
  const list =
    named.length >= 2 ? `${named[0]} y ${named[1]}` : (named[0] ?? 'la zona');
  return `¡Dale, te ayudo! Donde más opciones tenemos hoy es en ${list}. ¿Arrancamos por ahí?`;
}

/** El resultado repite exactamente el último enviado: no re-mandar las mismas fichas. */
const SAME_RESULTS_VARIANTS = [
  'Esas que te mostré recién son todas las opciones que tengo hoy con esos filtros 🙂 ¿Te interesa alguna? Decime el número, o si querés cambiamos algo (zona, presupuesto o ambientes).',
  'Con esos filtros, lo que te mostré es todo lo que tengo por ahora. ¿Alguna te interesó? Si no, cambiamos zona, presupuesto o ambientes.',
  'Eso que viste es todo el stock disponible con esos filtros. Decime el número si te interesa alguna, o ajustamos algún criterio.',
];

export function buildSameResultsMessage(seed: string): string {
  return pickVariant(SAME_RESULTS_VARIANTS, seed);
}

const MISSING_FILTER_VARIANTS: Record<MissingFilter, (zone: string) => string[]> = {
  neighborhood: () => [
    '¡Buenísimo! Para arrancar, ¿por qué zona o barrio te gustaría buscar? Puede ser más de uno.',
    'Perfecto. ¿En qué zona o barrio te gustaría buscar? Podés nombrar más de uno.',
    'Genial, para arrancar contame en qué barrio o zona buscás (puede ser más de uno).',
  ],
  rooms: (zone) => [
    `Perfecto, ${zone} 👌 ¿Y cuántos ambientes necesitás como mínimo? (mono, 2, 3...)`,
    `Buenísimo, ${zone}. ¿Cuántos ambientes como mínimo necesitás? (mono, 2, 3...)`,
    `Dale, ${zone}. ¿Con cuántos ambientes mínimo buscás? (mono, 2, 3...)`,
  ],
  price: () => [
    'Última y te muestro opciones: ¿hasta cuánto es tu presupuesto? Un número aproximado me sirve.',
    'Ya casi: ¿hasta cuánto tenés pensado gastar? Con un número aproximado alcanza.',
    'Para terminar, ¿cuál es tu presupuesto máximo? No hace falta que sea exacto.',
  ],
};

export function buildMissingFilterFallback(
  missing: MissingFilter,
  neighborhoods: string[],
  seed: string,
): string {
  const zone =
    neighborhoods.length > 0
      ? neighborhoods.map(capitalize).join(', ')
      : 'esa zona';
  return pickVariant(MISSING_FILTER_VARIANTS[missing](zone), seed);
}

const OFF_TOPIC_REDIRECT_VARIANTS = [
  '¡Jaja, me encantaría, pero de eso no sé nada! Lo mío son las propiedades 🙂 ¿Seguimos con tu búsqueda?',
  'Uy, de eso no tengo idea 😅 Lo mío son las propiedades. ¿Seguimos con tu búsqueda?',
  'Eso no lo manejo yo, disculpá. ¿Retomamos la búsqueda de tu propiedad?',
];

export function buildOffTopicRedirectFallback(seed: string): string {
  return pickVariant(OFF_TOPIC_REDIRECT_VARIANTS, seed);
}

/** "En Bernal no tenemos nada disponible por ahora 😕 ¿Te interesa que busque en otra zona?" */
export function buildEmptyZoneMessage(neighborhoods: string[]): string {
  const zone =
    neighborhoods.length > 0
      ? neighborhoods.map(capitalize).join(' ni ')
      : 'esa zona';
  return `En ${zone} no tenemos nada disponible por ahora 😕 ¿Te interesa que busque en otra zona?`;
}

/**
 * Zona sin stock, pero con sugerencias (§4): aledañas con stock, o si no hay
 * aledañas mapeadas/con stock, las zonas con más movimiento. Siempre pide
 * permiso antes de ampliar.
 */
export function buildZoneSuggestionMessage(
  requestedZone: string,
  suggestions: string[],
  isFallbackTopStock: boolean,
): string {
  const zone = capitalize(requestedZone);
  const named = suggestions.map((s) => `*${capitalize(s)}*`);

  if (isFallbackTopStock) {
    const list =
      named.length === 2
        ? `${named[0]} y ${named[1]}`
        : (named[0] ?? 'otras zonas');
    return `En ${zone} no tengo nada disponible por ahora. Donde más movimiento tenemos es en ${list}, ¿te sirve alguna?`;
  }

  if (named.length === 2) {
    return `En ${zone} no tengo nada disponible ahora 😕 Pero sí tengo opciones en ${named[0]} y ${named[1]}, que están pegadas. ¿Querés que te muestre lo que hay ahí?`;
  }
  return `En ${zone} no tengo nada disponible ahora 😕 Pero sí tengo opciones en ${named[0]}, que está pegada. ¿Querés que te muestre lo que hay ahí?`;
}

/**
 * El lead ya rechazó (implícita o explícitamente) las zonas alternativas
 * ofrecidas en `buildZoneSuggestionMessage` y sigue sin darnos una zona con
 * stock real (§4, QA 2026-07-27: evita el loop de re-preguntar "¿qué zona?"
 * sobre una zona que ya le dijimos que no tenemos).
 */
export function buildZoneStillPendingMessage(offeredZones: string[]): string {
  const named = offeredZones.map((z) => `*${capitalize(z)}*`);
  const list =
    named.length === 2 ? `${named[0]} o ${named[1]}` : (named[0] ?? 'otra zona');
  return `Entiendo, pero por esa zona no tenemos nada disponible por ahora. Te tomo nota igual para avisarte apenas entre algo. Mientras tanto, ¿querés que te muestre lo que hay en ${list}?`;
}

/**
 * Zonas acumuladas donde ALGUNAS tienen stock y otras no (p.ej. el lead ya
 * tenía Caballito/Belgrano y agrega Munro, que no tiene nada): a diferencia
 * de `buildZoneSuggestionMessage` (todas sin stock), acá no hay que ofrecer
 * alternativas ni pedir permiso — simplemente se saca la zona muerta y se
 * sigue con las que sí tienen, avisando por qué.
 */
export function buildPartialZoneDropMessage(
  emptyZones: string[],
  remainingZones: string[],
): string {
  const empty = emptyZones.map(capitalize).join(' ni ');
  const remaining = remainingZones
    .map((zone) => `*${capitalize(zone)}*`)
    .join(' y ');
  return `En ${empty} no tenemos nada disponible por ahora 😕 ¿Te muestro lo que sí tengo en ${remaining}?`;
}

export function buildNoResultsMessage(
  relaxed: 'rooms' | 'price' | 'over_budget' | 'empty_zone' | null,
  neighborhoods: string[] = [],
): string {
  if (relaxed === 'empty_zone') {
    return buildEmptyZoneMessage(neighborhoods);
  }
  if (relaxed === null) {
    return 'Por ahora no tengo nada que encaje con eso. ¿Querés que probemos con otra zona o cambiando algún criterio?';
  }
  const zone =
    neighborhoods.length > 0
      ? neighborhoods.map(capitalize).join(' y ')
      : 'esa zona';
  if (relaxed === 'over_budget') {
    // Honesto: no fingir que "se amplió un poco" cuando está claramente arriba.
    return `Te lo digo sin vueltas: lo que tengo hoy en ${zone} está por encima de tu presupuesto 😕 Te muestro lo más cercano por si te interesa igual:`;
  }
  if (relaxed === 'rooms') {
    // Honesto: el algoritmo no "amplía un poco" el mínimo de ambientes, lo
    // saca del todo y muestra lo más parecido que encuentra (ver
    // PropertySearchService: sortByRoomsProximity). Decir "amplié un poco"
    // acá sería mentir, igual que con 'over_budget'.
    return `En ${zone} no tengo nada con esos ambientes, así que te muestro lo más parecido que encontré:`;
  }
  return `En ${zone} no había nada exacto con esos filtros, así que amplié un poco el presupuesto y encontré esto:`;
}

export const NO_RESULTS_EVEN_RELAXED =
  'Por ahora no tenemos nada disponible que se ajuste, ni relajando los criterios. Te aviso apenas entre algo que pueda interesarte.';

const NUMBER_EMOJI: Record<number, string> = {
  1: '1️⃣',
  2: '2️⃣',
  3: '3️⃣',
};

/** Prefijo numerado de la ficha (para que el lead responda "la 2" y matchee directo). */
function numberPrefix(index: number): string {
  return NUMBER_EMOJI[index] ?? `${index}.`;
}

export function formatPropertyCaption(
  property: PropertyWithPhotos,
  index: number,
): string {
  const price = Number(property.price).toLocaleString('es-AR');
  const roomsPart = property.rooms ? ` · ${property.rooms} amb.` : '';
  const feature = property.features[0];
  const lines = [
    `${numberPrefix(index)} ${property.title}`,
    `${capitalize(property.neighborhood)} · ${property.currency} ${price}${roomsPart}`,
    feature ?? null,
    property.listingUrl ?? null,
  ].filter((line): line is string => Boolean(line));
  return lines.join('\n');
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
