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
export function normalizeText(input: string): string {
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

function levenshtein(a: string, b: string): number {
  const dp: number[][] = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) =>
      i === 0 ? j : j === 0 ? i : 0,
    ),
  );
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp[a.length][b.length];
}

/** Cuántos errores de tipeo tolerar según el largo de la palabra. */
function maxTypoDistance(word: string): number {
  return word.length <= 5 ? 1 : 2;
}

/**
 * ¿El barrio (tal como lo devolvió el LLM, sin resolver alias) está
 * realmente mencionado en el texto de este turno? Tolera errores de tipeo
 * palabra por palabra ("caballto" ~ "caballito"): el LLM suele corregir la
 * ortografía al extraer, así que un match exacto de substring rechaza
 * menciones legítimas mal escritas. Para nombres de varias palabras
 * ("villa urquiza") exige que TODAS matcheen, para no aceptar por una sola
 * palabra genérica compartida ("villa") con un barrio distinto.
 */
export function textMentionsNeighborhood(
  turnText: string,
  neighborhood: string,
): boolean {
  const turnNormalized = normalizeText(turnText);
  const target = normalizeText(neighborhood);
  if (turnNormalized.includes(target)) {
    return true;
  }
  const turnWords = turnNormalized.split(/[^a-z0-9]+/).filter(Boolean);
  const targetWords = target.split(' ').filter(Boolean);
  return targetWords.every((targetWord) =>
    turnWords.some(
      (word) => levenshtein(word, targetWord) <= maxTypoDistance(targetWord),
    ),
  );
}
