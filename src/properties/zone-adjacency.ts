/**
 * Zonas aledañas (§4 de MEJORAS-CONVERSACION.md): mapa estático para sugerir
 * alternativas cuando la zona pedida no tiene stock. Claves y valores en
 * formato normalizado (minúsculas, sin tildes), igual que `neighborhoods.ts`.
 */
const ZONAS_ALEDANAS: Readonly<Record<string, readonly string[]>> = {
  'villa crespo': ['palermo', 'caballito'],
  colegiales: ['belgrano', 'palermo'],
  nunez: ['belgrano'],
  coghlan: ['belgrano', 'villa urquiza'],
  saavedra: ['villa urquiza', 'belgrano'],
  flores: ['caballito'],
  almagro: ['caballito', 'palermo'],
  'parque chas': ['villa urquiza'],
  'villa pueyrredon': ['villa urquiza'],
  chacarita: ['palermo', 'villa urquiza'],
  recoleta: ['palermo'],
  boedo: ['caballito'],
  'villa devoto': ['villa urquiza'],
  agronomia: ['villa urquiza', 'caballito'],
};

export function getAdjacentZones(zone: string): readonly string[] {
  return ZONAS_ALEDANAS[zone] ?? [];
}
