/**
 * Normalización de barrios/zonas para `Property.neighborhood` y los filtros
 * del lead. Todo se guarda en minúsculas y sin tildes (ver docs/02-DATOS.md §Notas).
 */

/** Los 48 barrios oficiales de CABA, ya normalizados (canónicos). */
export const CABA_NEIGHBORHOODS = [
  'agronomia',
  'almagro',
  'balvanera',
  'barracas',
  'belgrano',
  'boedo',
  'caballito',
  'chacarita',
  'coghlan',
  'colegiales',
  'constitucion',
  'flores',
  'floresta',
  'la boca',
  'la paternal',
  'liniers',
  'mataderos',
  'monte castro',
  'monserrat',
  'nueva pompeya',
  'nunez',
  'palermo',
  'parque avellaneda',
  'parque chacabuco',
  'parque chas',
  'parque patricios',
  'puerto madero',
  'recoleta',
  'retiro',
  'saavedra',
  'san cristobal',
  'san nicolas',
  'san telmo',
  'velez sarsfield',
  'versalles',
  'villa crespo',
  'villa del parque',
  'villa devoto',
  'villa general mitre',
  'villa lugano',
  'villa luro',
  'villa ortuzar',
  'villa pueyrredon',
  'villa real',
  'villa riachuelo',
  'villa santa rita',
  'villa soldati',
  'villa urquiza',
] as const;

/** Localidades más comunes de GBA norte/oeste/sur, ya normalizadas (canónicas). */
export const GBA_NEIGHBORHOODS = [
  // Norte
  'san isidro',
  'vicente lopez',
  'olivos',
  'martinez',
  'acassuso',
  'beccar',
  'boulogne',
  'san fernando',
  'tigre',
  'nordelta',
  'pilar',
  'escobar',
  // Oeste
  'moron',
  'ituzaingo',
  'hurlingham',
  'ramos mejia',
  'haedo',
  'castelar',
  'moreno',
  'merlo',
  // Sur
  'avellaneda',
  'lanus',
  'lomas de zamora',
  'banfield',
  'adrogue',
  'quilmes',
  'wilde',
  'berazategui',
] as const;

export const KNOWN_NEIGHBORHOODS: ReadonlySet<string> = new Set([
  ...CABA_NEIGHBORHOODS,
  ...GBA_NEIGHBORHOODS,
]);

/**
 * Alias/variantes coloquiales → barrio o localidad canónica (ya normalizada).
 * Las claves están normalizadas (minúsculas, sin tildes) para que la búsqueda
 * en `normalizeNeighborhood` sea directa.
 */
const ALIASES: Readonly<Record<string, string>> = {
  // Palermo y sus sub-zonas
  'palermo soho': 'palermo',
  'palermo hollywood': 'palermo',
  'palermo chico': 'palermo',
  'palermo nuevo': 'palermo',
  'palermo botanico': 'palermo',
  'las canitas': 'palermo',
  'villa freud': 'palermo',
  'bajo palermo': 'palermo',

  // Recoleta
  'barrio norte': 'recoleta',

  // Balvanera
  once: 'balvanera',
  abasto: 'balvanera',
  congreso: 'balvanera',

  // San Nicolás
  microcentro: 'san nicolas',
  tribunales: 'san nicolas',
  'city sur': 'san nicolas',

  // Retiro
  catalinas: 'retiro',

  // Belgrano
  'bajo belgrano': 'belgrano',
  'belgrano chico': 'belgrano',
  'belgrano r': 'belgrano',
  'barrio chino': 'belgrano',

  // Núñez
  nunez: 'nunez',

  // Villa Crespo / Chacarita zona
  'parque centenario': 'caballito',

  // GBA Norte: variantes de escritura
  'vte lopez': 'vicente lopez',
  'v lopez': 'vicente lopez',
  's isidro': 'san isidro',
  'san isidro centro': 'san isidro',

  // GBA Oeste
  ramos: 'ramos mejia',

  // GBA Sur
  'lomas de zamora centro': 'lomas de zamora',

  // Zona/ciudad genérica (no es un barrio puntual, pero se normaliza igual)
  capital: 'caba',
  'capital federal': 'caba',
  caba: 'caba',
  'ciudad de buenos aires': 'caba',
};

/** minúsculas, sin tildes/diacríticos, espacios colapsados y recortados. */
function normalizeText(input: string): string {
  return input
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Normaliza un barrio/zona ingresado en lenguaje natural a su forma canónica.
 * Si no matchea el diccionario, devuelve el texto normalizado tal cual
 * (queda a criterio del caller decidir si es un barrio "conocido" via
 * `KNOWN_NEIGHBORHOODS`).
 */
export function normalizeNeighborhood(raw: string): string {
  const normalized = normalizeText(raw);
  return ALIASES[normalized] ?? normalized;
}

export function isKnownNeighborhood(raw: string): boolean {
  return KNOWN_NEIGHBORHOODS.has(normalizeNeighborhood(raw));
}
