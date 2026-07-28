import React, { useState } from 'react';
import type { Appointment, AssignableUser } from '../../api/endpoints';
import {
  cancelAppointment,
  confirmAppointment,
  markAppointmentDone,
  markAppointmentNoShow,
  rescheduleAppointment,
} from '../../api/endpoints';
import { AppointmentStatusBadge } from './AppointmentStatusBadge';
import { AppointmentActionForm } from './AppointmentActionForm';
import type { AppointmentActionFormSubmitData } from './AppointmentActionForm';
import { ErrorBanner } from '../ErrorBanner';
import { Button, Td, Tr } from '../ui';

export interface AppointmentRowProps {
  appointment: Appointment;
  tenantId: string;
  token: string;
  assignableUsers?: AssignableUser[];
  onUpdated: (updated: Appointment) => void;
}

type OpenForm = 'confirm' | 'reschedule' | null;

/**
 * Fila de una cita en la agenda. Muestra fecha/hora (o "sin confirmar"), lead,
 * estado y asesor asignado, y ofrece las acciones válidas según `status`
 * (AC-4, AC-5, AC-6). Al confirmar/reprogramar abre `AppointmentActionForm` en
 * lugar de los botones. Cubre AC-7 a AC-14.
 */
export const AppointmentRow: React.FC<AppointmentRowProps> = ({
  appointment,
  tenantId,
  token,
  assignableUsers,
  onUpdated,
}) => {
  const [openForm, setOpenForm] = useState<OpenForm>(null);
  const [pending, setPending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const formattedDate = appointment.scheduledAt
    ? new Date(appointment.scheduledAt).toLocaleString('es-AR')
    : 'sin confirmar';

  const runAction = async (fn: () => Promise<Appointment>): Promise<void> => {
    setPending(true);
    setActionError(null);
    try {
      const updated = await fn();
      onUpdated(updated);
      setOpenForm(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  };

  const handleConfirmSubmit = (data: AppointmentActionFormSubmitData): void => {
    void runAction(() =>
      confirmAppointment(
        tenantId,
        appointment.id,
        {
          scheduledAt: data.scheduledAt,
          assignedUserId: data.assignedUserId,
          notes: data.notes,
        },
        token,
      ),
    );
  };

  const handleRescheduleSubmit = (data: AppointmentActionFormSubmitData): void => {
    void runAction(() =>
      rescheduleAppointment(
        tenantId,
        appointment.id,
        { scheduledAt: data.scheduledAt, notes: data.notes },
        token,
      ),
    );
  };

  const handleCancel = (): void => {
    // eslint-disable-next-line no-alert
    if (!window.confirm('¿Cancelar esta cita?')) return;
    void runAction(() => cancelAppointment(tenantId, appointment.id, {}, token));
  };

  const handleMarkDone = (): void => {
    // eslint-disable-next-line no-alert
    const outcome = window.prompt('Notas sobre la visita (opcional)')?.trim();
    void runAction(() =>
      markAppointmentDone(tenantId, appointment.id, outcome ? { notes: outcome } : {}, token),
    );
  };

  const handleMarkNoShow = (): void => {
    // eslint-disable-next-line no-alert
    const reason = window.prompt('Motivo del no-show (opcional)')?.trim();
    void runAction(() =>
      markAppointmentNoShow(tenantId, appointment.id, reason ? { notes: reason } : {}, token),
    );
  };

  return (
    <Tr data-testid="appointment-row">
      {/* Fecha, lead y asesor son datos tabulares: van en monoespaciada para
          que las columnas alineen y la próxima visita se lea de un vistazo. */}
      <Td
        data-testid="appointment-row-scheduled-at"
        className="u-num whitespace-nowrap font-mono font-medium text-text"
      >
        {formattedDate}
      </Td>
      <Td data-testid="appointment-row-lead" className="font-mono text-xs text-text-muted">
        {appointment.leadId}
      </Td>
      <Td>
        <AppointmentStatusBadge status={appointment.status} />
      </Td>
      <Td data-testid="appointment-row-assignee" className="font-mono text-xs text-text-muted">
        {appointment.assignedUserId ?? 'Sin asignar'}
      </Td>
      <Td>
        {actionError && <ErrorBanner message={actionError} />}

        {openForm === 'confirm' && (
          <AppointmentActionForm
            mode="confirm"
            assignableUsers={assignableUsers}
            onSubmit={handleConfirmSubmit}
            onVolver={() => setOpenForm(null)}
            disabled={pending}
          />
        )}

        {openForm === 'reschedule' && (
          <AppointmentActionForm
            mode="reschedule"
            onSubmit={handleRescheduleSubmit}
            onVolver={() => setOpenForm(null)}
            disabled={pending}
          />
        )}

        {openForm === null && appointment.status === 'PROPOSED' && (
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" onClick={() => setOpenForm('confirm')} disabled={pending}>
              Confirmar
            </Button>
            <Button type="button" size="sm" variant="secondary" onClick={handleCancel} disabled={pending}>
              Cancelar
            </Button>
          </div>
        )}

        {openForm === null && appointment.status === 'CONFIRMED' && (
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" onClick={() => setOpenForm('reschedule')} disabled={pending}>
              Reprogramar
            </Button>
            <Button type="button" size="sm" variant="secondary" onClick={handleCancel} disabled={pending}>
              Cancelar
            </Button>
            <Button type="button" size="sm" variant="secondary" onClick={handleMarkDone} disabled={pending}>
              Marcar hecha
            </Button>
            <Button type="button" size="sm" variant="danger" onClick={handleMarkNoShow} disabled={pending}>
              Marcar no-show
            </Button>
          </div>
        )}
      </Td>
    </Tr>
  );
};
