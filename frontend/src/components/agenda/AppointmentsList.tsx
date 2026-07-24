import React from 'react';
import type { Appointment, AssignableUser } from '../../api/endpoints';
import { AppointmentRow } from './AppointmentRow';

export interface AppointmentsListProps {
  appointments: Appointment[];
  tenantId: string;
  token: string;
  assignableUsers?: AssignableUser[];
  onAppointmentUpdated: (updated: Appointment) => void;
}

/**
 * Renderiza una lista de citas como filas. Ordena por `scheduledAt` ascendente,
 * con las citas sin fecha (PROPOSED, scheduledAt === null) al final.
 * Cada fila es un AppointmentRow que maneja acciones y actualizaciones in-place.
 *
 * Cubre AC-2 (orden y display de citas).
 */
export const AppointmentsList: React.FC<AppointmentsListProps> = ({
  appointments,
  tenantId,
  token,
  assignableUsers,
  onAppointmentUpdated,
}) => {
  // Ordena por scheduledAt ascendente, con PROPOSED (scheduledAt === null) al final
  const sorted = [...appointments].sort((a, b) => {
    const aHasDate = a.scheduledAt !== null;
    const bHasDate = b.scheduledAt !== null;

    // Si uno tiene fecha y el otro no, el que tiene fecha va primero
    if (aHasDate && !bHasDate) return -1;
    if (!aHasDate && bHasDate) return 1;

    // Si ambos tienen fecha, ordena por fecha ascendente
    if (aHasDate && bHasDate) {
      return new Date(a.scheduledAt!).getTime() - new Date(b.scheduledAt!).getTime();
    }

    // Si ambos no tienen fecha, mantiene el orden relativo
    return 0;
  });

  return (
    <div data-testid="appointments-list">
      {sorted.map((appointment) => (
        <AppointmentRow
          key={appointment.id}
          appointment={appointment}
          tenantId={tenantId}
          token={token}
          assignableUsers={assignableUsers}
          onUpdated={onAppointmentUpdated}
        />
      ))}
    </div>
  );
};
