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
    void runAction(() => markAppointmentDone(tenantId, appointment.id, {}, token));
  };

  const handleMarkNoShow = (): void => {
    void runAction(() => markAppointmentNoShow(tenantId, appointment.id, {}, token));
  };

  return (
    <div data-testid="appointment-row">
      {actionError && <ErrorBanner message={actionError} />}

      <div data-testid="appointment-row-scheduled-at">{formattedDate}</div>
      <div data-testid="appointment-row-lead">{appointment.leadId}</div>
      <AppointmentStatusBadge status={appointment.status} />
      <div data-testid="appointment-row-assignee">
        {appointment.assignedUserId ?? 'Sin asignar'}
      </div>

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
        <>
          <button type="button" onClick={() => setOpenForm('confirm')} disabled={pending}>
            Confirmar
          </button>
          <button type="button" onClick={handleCancel} disabled={pending}>
            Cancelar
          </button>
        </>
      )}

      {openForm === null && appointment.status === 'CONFIRMED' && (
        <>
          <button type="button" onClick={() => setOpenForm('reschedule')} disabled={pending}>
            Reprogramar
          </button>
          <button type="button" onClick={handleCancel} disabled={pending}>
            Cancelar
          </button>
          <button type="button" onClick={handleMarkDone} disabled={pending}>
            Marcar hecha
          </button>
          <button type="button" onClick={handleMarkNoShow} disabled={pending}>
            Marcar no-show
          </button>
        </>
      )}
    </div>
  );
};
