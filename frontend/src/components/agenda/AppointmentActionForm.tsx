import React, { useState } from 'react';
import type { AssignableUser } from '../../api/endpoints';

export type AppointmentActionFormMode = 'confirm' | 'reschedule';

export interface AppointmentActionFormSubmitData {
  scheduledAt: string;
  assignedUserId?: string;
  notes?: string;
}

export interface AppointmentActionFormProps {
  /** "confirm" muestra el campo de notas y rotula el submit "Confirmar cita";
   *  "reschedule" oculta notas y rotula el submit "Reprogramar cita". */
  mode: AppointmentActionFormMode;
  /** Asesores disponibles para el selector opcional (solo relevante en "confirm"). */
  assignableUsers?: AssignableUser[];
  /** Invocado con el `scheduledAt` ya convertido a ISO string, solo si la
   *  validación de fecha/hora pasó. */
  onSubmit: (data: AppointmentActionFormSubmitData) => void;
  /** Cierra el formulario sin invocar `onSubmit`. */
  onVolver: () => void;
  /** Deshabilita los controles mientras una acción está en curso. */
  disabled?: boolean;
}

/**
 * Formulario inline para confirmar o reprogramar una cita (AC-7, AC-8, AC-9).
 *
 * - El botón submit se rotula "Confirmar cita" / "Reprogramar cita" (nunca
 *   "Confirmar" a secas) para no colisionar con el regex anclado
 *   `/^confirmar$/i` que AC-5 usa contra el botón "Confirmar" de la fila.
 * - El botón "Volver" cierra sin invocar nada, evitando colisionar con el
 *   texto "Cancelar" de `AppointmentRow`.
 * - Sin fecha/hora seleccionada, no invoca `onSubmit` y muestra el texto
 *   exacto "Selecciona una fecha y hora".
 */
export const AppointmentActionForm: React.FC<AppointmentActionFormProps> = ({
  mode,
  assignableUsers = [],
  onSubmit,
  onVolver,
  disabled = false,
}) => {
  const [scheduledAtInput, setScheduledAtInput] = useState('');
  const [assignedUserId, setAssignedUserId] = useState('');
  const [notes, setNotes] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);

  const submitLabel = mode === 'confirm' ? 'Confirmar cita' : 'Reprogramar cita';

  const handleSubmit = (event: React.FormEvent): void => {
    event.preventDefault();

    if (!scheduledAtInput) {
      setValidationError('Selecciona una fecha y hora');
      return;
    }

    const date = new Date(scheduledAtInput);
    if (Number.isNaN(date.getTime())) {
      setValidationError('Selecciona una fecha y hora');
      return;
    }

    setValidationError(null);

    const data: AppointmentActionFormSubmitData = { scheduledAt: date.toISOString() };
    if (mode === 'confirm') {
      if (assignedUserId) data.assignedUserId = assignedUserId;
      if (notes.trim()) data.notes = notes.trim();
    }

    onSubmit(data);
  };

  return (
    <form data-testid="appointment-action-form" onSubmit={handleSubmit}>
      <label htmlFor="appointment-action-form-scheduled-at">Fecha y hora</label>
      <input
        id="appointment-action-form-scheduled-at"
        data-testid="scheduled-at-input"
        type="datetime-local"
        value={scheduledAtInput}
        onChange={(e) => {
          setScheduledAtInput(e.target.value);
          if (validationError) setValidationError(null);
        }}
        disabled={disabled}
      />

      {mode === 'confirm' && assignableUsers.length > 0 && (
        <>
          <label htmlFor="appointment-action-form-assignee">Asesor</label>
          <select
            id="appointment-action-form-assignee"
            data-testid="appointment-action-form-assignee"
            value={assignedUserId}
            onChange={(e) => setAssignedUserId(e.target.value)}
            disabled={disabled}
          >
            <option value="">Sin asignar</option>
            {assignableUsers.map((user) => (
              <option key={user.id} value={user.id}>
                {user.email}
              </option>
            ))}
          </select>
        </>
      )}

      {mode === 'confirm' && (
        <>
          <label htmlFor="appointment-action-form-notes">Notas</label>
          <textarea
            id="appointment-action-form-notes"
            data-testid="appointment-action-form-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            disabled={disabled}
          />
        </>
      )}

      {validationError && (
        <div
          data-testid="appointment-action-form-validation-error"
          style={{ color: '#dc2626', fontSize: '13px' }}
        >
          {validationError}
        </div>
      )}

      <button type="submit" data-testid="appointment-action-form-submit" disabled={disabled}>
        {submitLabel}
      </button>
      <button
        type="button"
        data-testid="appointment-action-form-volver"
        onClick={onVolver}
        disabled={disabled}
      >
        Volver
      </button>
    </form>
  );
};
