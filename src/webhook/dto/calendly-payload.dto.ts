/**
 * DTO para la payload simplificada de eventos de Calendly.
 */
export interface CalendlyPayload {
  event: string;
  payload: {
    event_type: {
      uuid: string;
      name: string;
    };
    start_time: string;
    end_time: string;
    invitee: {
      uuid: string;
      email: string;
      name: string;
      timezone: string;
      text_reminder_number: string | null;
      payment: unknown;
    };
  };
}
