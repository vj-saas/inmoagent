/**
 * Detección determinística de señales de compra fuertes (spec 09, T3.1).
 *
 * Hallazgo H4 (docs/09 §1): el LLM clasifica preguntas de pago/descuento como
 * `off_topic` ("en zonaprop vi uno igual a 130 mil, me hacen descuento si
 * pago de contado?" → el bot respondía "yo sólo puedo ayudarte con la
 * búsqueda..."). Una consulta de pago contado es la señal de compra más
 * fuerte que existe y el bot la trataba como si preguntaran por fútbol.
 *
 * Por eso esto es regex, NO una clasificación del LLM: el LLM ya demostró
 * fallar en exactamente este caso.
 */
const BUYING_SIGNAL_PATTERNS = [
  /descuento/i,
  /\bcontado\b/i,
  /cu[aá]nto me lo dej[aá]s?/i,
  /negociable/i,
  /financia(ci[oó]n)?/i,
  /permuta/i,
  /\bse[ñn]a\b/i,
  /\breserva(r)?\b/i,
  /escritura(ci[oó]n)?/i,
  /apto\s*cr[eé]dito/i,
  /\bcuotas?\b/i,
  /anticipo/i,
];

/**
 * ¿El turno trae una señal de compra fuerte? Determinístico: se evalúa
 * ANTES de la clasificación de `off_topic`/`ask_question` del LLM
 * (`ConversationEngine.resolveResult`), así nunca se le da el trato de
 * "pregunta ajena a la búsqueda" a una consulta de pago/descuento/reserva.
 */
export function hasBuyingSignal(turnText: string): boolean {
  return BUYING_SIGNAL_PATTERNS.some((pattern) => pattern.test(turnText));
}
