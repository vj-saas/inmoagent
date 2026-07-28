/**
 * Registro configurable por tenant (spec 09, T2.4): `tenant.botFormality`.
 * "cercano" (default) deja el copy tal cual está hoy. "formal" saca emojis y
 * las muletillas de una lista cerrada, sin tocar el contenido real del
 * mensaje (nunca el aviso Ley 25.326, que no tiene ninguna de las dos cosas).
 *
 * Aplicado de forma centralizada en `ConversationEngine.sendActions` sobre
 * TODO texto saliente (fijo o redactado por el LLM vía SafeReplyService): es
 * más simple y más difícil de "olvidar" en un mensaje nuevo que mantener
 * variantes formales dedicadas para cada template.
 */
export type BotFormality = 'cercano' | 'formal';

const EMOJI_PATTERN = /\p{Extended_Pictographic}/gu;

/**
 * Solo se saca si aparece como apertura de la oración ("¡Dale, ...", "Genial,
 * ...", "¡Jaja, ..."): es el único patrón que existe hoy en el copy real, y
 * anclarlo a `^` evita sacar la palabra si apareciera de casualidad en medio
 * de una oración con otro sentido.
 */
const MULETILLA_OPENER =
  /^¡?\s*(jaja|joya|buen[ií]simo|dale|genial|che)\s*[,!.…]*\s*/i;

function capitalizeFirst(text: string): string {
  return text.length > 0 ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

export function applyFormality(text: string, formality: string): string {
  if (formality !== 'formal') {
    return text;
  }
  const withoutEmoji = text.replace(EMOJI_PATTERN, '');
  const withoutOpener = withoutEmoji.replace(MULETILLA_OPENER, '');
  const collapsed = withoutOpener.replace(/[ \t]{2,}/g, ' ').trim();
  return capitalizeFirst(collapsed);
}
