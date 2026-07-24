import React from 'react';

import type { AppointmentStatus } from '../../api/endpoints';

/**
 * Tabla de mapeo aprobada de etiquetas en español a valores del enum
 * `AppointmentStatus` del backend (ver specs/B2-vista-agenda/spec.md).
 * "Todas" no tiene entrada acá: no envía filtro (ver `onChange` más abajo).
 */
export const APPOINTMENT_STATUS_LABELS: Record<
  Exclude<AppointmentStatus, never>,
  string
> = {
  PROPOSED: 'Propuesta',
  CONFIRMED: 'Confirmada',
  DONE: 'Realizada',
  CANCELLED: 'Cancelada',
  NO_SHOW: 'No asistió',
};

const OPTIONS: Array<AppointmentStatus | 'Todas'> = [
  'Todas',
  'PROPOSED',
  'CONFIRMED',
  'DONE',
  'CANCELLED',
  'NO_SHOW',
];

export interface AppointmentStatusFilterProps {
  /** Callback invocado con el array contiendo el `AppointmentStatus` elegido,
   *  o `undefined` para "Todas" (sin filtro). */
  onChange: (statuses: AppointmentStatus[] | undefined) => void;
  /** Estado inicialmente seleccionado (por defecto "Todas"). */
  value?: AppointmentStatus | 'Todas';
}

export const AppointmentStatusFilter: React.FC<AppointmentStatusFilterProps> = ({
  onChange,
  value,
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selected = e.target.value;
    if (selected === 'Todas') {
      onChange(undefined);
      return;
    }
    onChange([selected as AppointmentStatus]);
  };

  return (
    <select
      data-testid="appointment-status-filter"
      defaultValue={value ?? 'Todas'}
      onChange={handleChange}
      style={{
        padding: '8px 12px',
        fontSize: '14px',
        border: '1px solid #ccc',
        borderRadius: '4px',
      }}
    >
      {OPTIONS.map((option) => (
        <option key={option} value={option}>
          {option === 'Todas' ? 'Todas' : APPOINTMENT_STATUS_LABELS[option]}
        </option>
      ))}
    </select>
  );
};
