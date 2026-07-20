export const QUEUE_INBOUND = 'inbound';
export const QUEUE_MEDIA = 'media';
export const QUEUE_OUTBOUND = 'outbound';
export const QUEUE_MAINTENANCE = 'maintenance';

/** Job de un Message individual recién persistido (encolado por WebhookService/MediaProcessor). */
export const JOB_PROCESS_MESSAGE = 'process-message';
/** Job delayed que dispara el procesamiento del turno acumulado de un lead (DebounceBuffer). */
export const JOB_PROCESS_TURN = 'process-turn';
