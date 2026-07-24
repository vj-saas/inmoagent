import React from 'react';
import type { AppointmentStatus } from '../../api/endpoints';

/**
 * Traducción de `AppointmentStatus` a texto en español.
 */
const STATUS_LABELS: Record<AppointmentStatus, string> = {
  PROPOSED: 'Propuesta',
  CONFIRMED: 'Confirmada',
  DONE: 'Realizada',
  CANCELLED: 'Cancelada',
  NO_SHOW: 'No asistió',
};

export interface AppointmentStatusBadgeProps {
  status: AppointmentStatus;
}

export const AppointmentStatusBadge: React.FC<AppointmentStatusBadgeProps> = ({ status }) => {
  return (
    <span
      data-testid="appointment-status-badge"
      style={{
        backgroundColor: '#eef2ff',
        color: '#3730a3',
        borderRadius: '999px',
        padding: '4px 10px',
        fontSize: '12px',
        lineHeight: '1.4',
      }}
    >
      {STATUS_LABELS[status]}
    </span>
  );
};
