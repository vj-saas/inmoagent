import React from 'react';
import type { AppointmentStatus } from '../../api/endpoints';
import { Badge } from '../ui';

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

/** Tono de `Badge` por estado; PROPOSED/CONFIRMED usan info/success como en el resto del dashboard. */
const STATUS_TONES: Record<AppointmentStatus, 'neutral' | 'info' | 'success' | 'warning' | 'danger'> = {
  PROPOSED: 'info',
  CONFIRMED: 'success',
  DONE: 'neutral',
  CANCELLED: 'danger',
  NO_SHOW: 'warning',
};

export interface AppointmentStatusBadgeProps {
  status: AppointmentStatus;
}

export const AppointmentStatusBadge: React.FC<AppointmentStatusBadgeProps> = ({ status }) => {
  return (
    <Badge data-testid="appointment-status-badge" tone={STATUS_TONES[status]}>
      {STATUS_LABELS[status]}
    </Badge>
  );
};
