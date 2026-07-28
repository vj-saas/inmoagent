import { createHash } from 'node:crypto';

/**
 * Selección determinística de una variante de copy. `seed` tiene que tener la
 * forma `"${leadId}:${turnCount}"`: el `leadId` se hashea a un offset estable
 * por lead, y `turnCount` se suma antes del módulo. Así, dos turnos
 * consecutivos del mismo lead caen en índices consecutivos (mod
 * `variants.length`) y NUNCA repiten variante de un turno al siguiente (spec
 * 09, T2.1 AC-2) — sin esto, un hash "plano" del seed completo podría repetir
 * por azar. Misma entrada, misma salida (testeable/reproducible en el
 * simulador). Cero costo de LLM, cero riesgo de alucinación.
 */
export function pickVariant(variants: string[], seed: string): string {
  if (variants.length === 0) {
    throw new Error('pickVariant: variants no puede estar vacío');
  }
  if (variants.length === 1) {
    return variants[0];
  }

  const separatorIndex = seed.lastIndexOf(':');
  const leadPart = separatorIndex === -1 ? seed : seed.slice(0, separatorIndex);
  const turnPartRaw =
    separatorIndex === -1 ? '0' : seed.slice(separatorIndex + 1);
  const turnCount = Number(turnPartRaw);
  const turnOffset = Number.isFinite(turnCount) ? turnCount : 0;

  const hash = createHash('sha256').update(leadPart).digest();
  const leadOffset = hash.readUInt32BE(0);

  const index = (leadOffset + turnOffset) % variants.length;
  return variants[index];
}
