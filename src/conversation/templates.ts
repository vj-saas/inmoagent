import type { Lead, Tenant } from '@prisma/client';
import type { PropertyWithPhotos } from '../properties/property-search.service';
import type { MissingFilter } from './filters.util';

const OPERATION_LABEL: Record<string, string> = {
  SALE: 'compra',
  RENT: 'alquiler',
  TEMP_RENT: 'alquiler temporario',
};

/** Resumen legible de los filtros del lead, para la notificación interna al tenant. */
export function summarizeLeadFilters(lead: Lead): string {
  const parts: string[] = [];
  if (lead.fOperation)
    parts.push(OPERATION_LABEL[lead.fOperation] ?? lead.fOperation);
  if (lead.fNeighborhoods.length > 0)
    parts.push(`en ${lead.fNeighborhoods.join(', ')}`);
  if (lead.fMaxPrice)
    parts.push(
      `hasta ${lead.fCurrency ?? ''} ${Number(lead.fMaxPrice).toLocaleString('es-AR')}`.trim(),
    );
  if (lead.fMinRooms) parts.push(`${lead.fMinRooms}+ amb.`);
  return parts.length > 0 ? parts.join(', ') : 'sin filtros definidos todavía';
}

/** Mensajes 100% deterministos (sin LLM) — docs/03-CONVERSACION.md. */

export function buildGreetingMessage(tenant: Tenant): string {
  const privacyLine = `_Al continuar aceptás que ${tenant.name} use tus datos solo para gestionar tu consulta (Ley 25.326). Escribí BAJA cuando quieras dejar de recibir mensajes._`;
  return `¡Hola! 👋 Soy ${tenant.botName}, de ${tenant.name}. Estoy para ayudarte a encontrar tu próxima propiedad, a cualquier hora.\n\nContame, ¿estás buscando *comprar* o *alquilar*?\n\n${privacyLine}`;
}

/** Repregunta de operación cuando el saludo completo ya se mandó antes (no repetirlo íntegro). */
export const OPERATION_FOLLOWUP_FALLBACK = '¿Buscás *comprar* o *alquilar*?';

export const OPT_OUT_CONFIRMATION =
  'Listo, no te escribimos más. Si algún día retomás la búsqueda, escribinos y seguimos donde quedamos.';

export function buildHandoffFarewell(tenant: Tenant): string {
  const hoursLine = tenant.humanHours
    ? ` Horario de atención: ${tenant.humanHours}.`
    : '';
  return `¡Claro! Te dejo con un asesor de ${tenant.name}, te escribe a la brevedad.${hoursLine}`;
}

/** Handoff post-interés en una propiedad: baja el peso de la decisión (§5.4). */
export function buildSchedulingHandoffMessage(tenant: Tenant): string {
  const hoursLine = tenant.humanHours
    ? ` (horario de atención: ${tenant.humanHours})`
    : '';
  return `¡Genial! La visita es sin compromiso y dura unos 20 minutos. Te dejo con un asesor de ${tenant.name}, que conoce la propiedad y te puede mostrar más opciones de la zona en la misma salida. Te escribe a la brevedad${hoursLine}.`;
}

export const HANDOFF_TIMEOUT_APOLOGY =
  'Perdón la demora en retomar, seguimos por acá. ¿En qué te puedo ayudar?';

export const REFORMULATE_REQUEST =
  'Perdón, no te terminé de entender. ¿Me lo podés contar de otra forma?';

export const SEARCH_INTRO = 'Encontré estas opciones para vos:';

/** "Mirá, en Palermo tengo estas opciones para que te des una idea:" (§3, búsqueda teaser). */
export function buildTeaserIntro(neighborhoods: string[]): string {
  const zone =
    neighborhoods.length > 0
      ? neighborhoods.map(capitalize).join(' y ')
      : 'esa zona';
  return `Mirá, en ${zone} tengo estas opciones para que te des una idea:`;
}

/** Excepción a "una pregunta por mensaje": el lead ya vio valor (§3, punto 4). */
export function buildTeaserClosingQuestion(count: number): string {
  const opener =
    count === 1 ? '¿Va por ahí lo que buscás?' : '¿Alguna va por ahí?';
  return `${opener} Para afinarte la búsqueda decime hasta cuánto es tu presupuesto y cuántos ambientes necesitás.`;
}

export function buildSearchClosingQuestion(count: number): string {
  if (count === 1) {
    return '¿Te interesa? Te coordino una visita — ¿te queda mejor *entre semana* o el *sábado*?';
  }
  return '¿Cuál te gustó más? Decime el número y te coordino una visita — ¿te queda mejor *entre semana* o el *sábado*?';
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
export const SAME_RESULTS_MESSAGE =
  'Esas que te mostré recién son todas las opciones que tengo hoy con esos filtros 🙂 ¿Te interesa alguna? Decime el número, o si querés cambiamos algo (zona, presupuesto o ambientes).';

export function buildMissingFilterFallback(
  missing: MissingFilter,
  neighborhoods: string[] = [],
): string {
  switch (missing) {
    case 'neighborhood':
      return '¡Buenísimo! Para arrancar, ¿por qué zona o barrio te gustaría buscar? Puede ser más de uno.';
    case 'rooms': {
      const zone =
        neighborhoods.length > 0
          ? neighborhoods.map(capitalize).join(', ')
          : 'esa zona';
      return `Perfecto, ${zone} 👌 ¿Y cuántos ambientes necesitás como mínimo? (mono, 2, 3...)`;
    }
    case 'price':
      return 'Última y te muestro opciones: ¿hasta cuánto es tu presupuesto? Un número aproximado me sirve.';
  }
}

export const OFF_TOPIC_REDIRECT_FALLBACK =
  '¡Jaja, me encantaría, pero de eso no sé nada! Lo mío son las propiedades 🙂 ¿Seguimos con tu búsqueda?';

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
  const relaxedLabel: Record<'rooms' | 'price', string> = {
    rooms: 'los ambientes',
    price: 'el presupuesto',
  };
  return `En ${zone} no había nada exacto con esos filtros, así que amplié un poco ${relaxedLabel[relaxed]} y encontré esto:`;
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
