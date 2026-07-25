/**
 * Ventana de servicio de 24hs de Meta WhatsApp Cloud API para envío de texto
 * libre. Se calcula sobre el último `Message` con `direction = IN` (ver
 * decisión 4 de `specs/V-B2-bandeja-manual/spec.md`) — NUNCA sobre
 * `Lead.lastMessageAt`, que también se actualiza con mensajes salientes.
 */

/** 24 horas en milisegundos. Regla fija de Meta, no un parámetro de negocio. */
export const SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Copy en español para el rechazo (409) cuando la ventana de servicio está cerrada. */
export const SERVICE_WINDOW_CLOSED_MESSAGE =
  'Pasaron 24hs o más desde el último mensaje del lead: hace falta un template ' +
  'aprobado por WhatsApp para reabrir la conversación antes de poder enviar texto libre.';

/**
 * `false` si no hay `lastInboundAt` o si ya pasaron 24hs o más desde ese
 * mensaje entrante (borde `>=` cerrado: exactamente 24hs cuenta como
 * cerrada, conservador porque Meta rechazaría el envío igual).
 */
export function isServiceWindowOpen(lastInboundAt: Date | null, now: Date): boolean {
  if (lastInboundAt === null) {
    return false;
  }
  return now.getTime() - lastInboundAt.getTime() < SERVICE_WINDOW_MS;
}
