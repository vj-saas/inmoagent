import React, { useState } from 'react';
import {
  patchAssignment,
  type AssignableUser,
  type Lead,
  type PatchAssignmentRequest,
} from '../../api/endpoints';
import { useApi } from '../../hooks/useApi';

export interface AssignmentControlProps {
  lead: Lead;
  assignableUsers: AssignableUser[];
  tenantId: string;
  leadId: string;
  token: string;
  /**
   * Callback invocado con el lead actualizado cuando el PATCH de asignación
   * se resuelve exitosamente, para reflejar el cambio sin recargar (AC-14).
   */
  onUpdated: (lead: Lead) => void;
}

const UNASSIGNED_VALUE = '__unassigned__';

/** Convierte el valor `datetime-local` (o vacío) a ISO string o null. */
function localInputToIso(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

/** Convierte un ISO string (o null) al formato esperado por `datetime-local`. */
function isoToLocalInput(value: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

/**
 * Control de asignación de un lead a una persona del equipo, con selección de
 * próxima fecha de acción (AC-12, AC-13, AC-14).
 *
 * - Selector poblado con `assignableUsers` + opción "Sin asignar".
 * - Input `datetime-local` para `nextActionAt`.
 * - Al guardar, arma el PATCH incluyendo solo los campos efectivamente
 *   cambiados respecto al valor inicial (semántica parcial): si el usuario
 *   no tocó el selector, no se incluye `assignedUserId`; si eligió
 *   explícitamente "Sin asignar", se manda `assignedUserId: null`.
 */
export const AssignmentControl: React.FC<AssignmentControlProps> = ({
  lead,
  assignableUsers,
  tenantId,
  leadId,
  token,
  onUpdated,
}) => {
  const initialAssignedUserId = lead.assignedUserId ?? UNASSIGNED_VALUE;
  const initialNextActionAt = isoToLocalInput(lead.nextActionAt);

  const [selectedUserId, setSelectedUserId] = useState<string>(initialAssignedUserId);
  const [assignedTouched, setAssignedTouched] = useState(false);
  const [nextActionAtInput, setNextActionAtInput] = useState<string>(initialNextActionAt);
  const [nextActionTouched, setNextActionTouched] = useState(false);

  const { loading, error, run } = useApi(
    patchAssignment as unknown as (...args: unknown[]) => Promise<Lead>,
  );

  const currentAssignee = assignableUsers.find((u) => u.id === lead.assignedUserId);
  const currentAssigneeLabel = lead.assignedUserId
    ? currentAssignee?.email ?? lead.assignedUserId
    : 'Sin asignar';

  const handleSave = async (): Promise<void> => {
    const dto: PatchAssignmentRequest = {};

    if (assignedTouched) {
      dto.assignedUserId = selectedUserId === UNASSIGNED_VALUE ? null : selectedUserId;
    }

    if (nextActionTouched) {
      dto.nextActionAt = localInputToIso(nextActionAtInput);
    }

    try {
      const updatedLead = await run(tenantId, leadId, dto, token);
      onUpdated(updatedLead);
      setAssignedTouched(false);
      setNextActionTouched(false);
    } catch {
      // El error ya queda expuesto vía `error` del useApi.
    }
  };

  return (
    <div data-testid="assignment-control">
      <div data-testid="assignment-control-current">Asignado a: {currentAssigneeLabel}</div>

      <label htmlFor="assignment-control-select">Asignar a</label>
      <select
        id="assignment-control-select"
        data-testid="assignment-control-select"
        value={selectedUserId}
        onChange={(e) => {
          setSelectedUserId(e.target.value);
          setAssignedTouched(true);
        }}
        disabled={loading}
      >
        <option value={UNASSIGNED_VALUE}>Sin asignar</option>
        {assignableUsers.map((user) => (
          <option key={user.id} value={user.id}>
            {user.email}
          </option>
        ))}
      </select>

      <label htmlFor="assignment-control-next-action">Próxima acción</label>
      <input
        id="assignment-control-next-action"
        data-testid="assignment-control-next-action"
        type="datetime-local"
        value={nextActionAtInput}
        onChange={(e) => {
          setNextActionAtInput(e.target.value);
          setNextActionTouched(true);
        }}
        disabled={loading}
      />

      <button
        type="button"
        data-testid="assignment-control-save"
        onClick={() => void handleSave()}
        disabled={loading}
      >
        {loading ? 'Guardando...' : 'Guardar'}
      </button>

      {error && (
        <div
          data-testid="assignment-control-error"
          style={{ color: '#dc2626', fontSize: '13px', marginTop: '4px' }}
        >
          No se pudo actualizar la asignación. Verificá los datos e intentá nuevamente.
        </div>
      )}
    </div>
  );
};
