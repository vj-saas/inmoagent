/**
 * Resuelve la URL de destino para la notificación push según la información del payload.
 * AC-11: al hacer click enfoca/abre la ficha del lead o agenda relevante.
 */
export function resolveNotificationTarget(data: {
  appointmentId?: string;
  leadId?: string;
}): string {
  if (data.leadId) {
    return `/leads/${data.leadId}`;
  }
  if (data.appointmentId) {
    return `/agenda?appointmentId=${data.appointmentId}`;
  }
  return '/agenda';
}
