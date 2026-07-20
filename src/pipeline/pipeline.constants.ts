/**
 * Respuesta fija para mensajes no soportados (stickers, ubicación, contactos,
 * etc.), ver docs/03-CONVERSACION.md §3.4. Se envía directo, sin pasar por el
 * debounce ni el ConversationEngine (que llega en la Fase 4).
 */
export const UNSUPPORTED_MESSAGE_RESPONSE =
  'Por ahora puedo leer mensajes de texto o notas de audio. ¿Me contás por ahí qué depto estás buscando?';
