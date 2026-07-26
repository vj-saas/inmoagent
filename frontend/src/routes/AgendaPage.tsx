/**
 * Agenda de citas del tenant.
 *
 * - Rango por defecto: hoy a hoy+6 días (7 días de ventana, formato
 *   `YYYY-MM-DD` local), calculado una sola vez en el init de `useState`
 *   (patrón `defaultRange()` de `DashboardPage.tsx`).
 * - Invoca `listAppointments(tenantId, { from, to, status }, token)` vía
 *   `useApi`, disparado por `onChange` de `DateRangePicker` (incluida la
 *   invocación inicial al montar, igual que `DashboardPage`) y por
 *   `onChange` de `AppointmentStatusFilter`. No se usa un `useEffect` propio
 *   para evitar una doble invocación en el mount (`DateRangePicker` ya
 *   emite `onChange` al montarse).
 * - Mantiene copia local de `appointments` en `useState`: se reemplaza cuando
 *   resuelve `listAppointments`, y se actualiza in-place (por `id`) cuando
 *   `AppointmentsList` reporta una cita actualizada vía `onAppointmentUpdated`,
 *   sin volver a invocar `listAppointments`.
 * - Render mutuamente excluyente: Spinner (loading) / ErrorBanner (error) /
 *   AppointmentsList (data), montado solo cuando `!loading && !error`.
 * - `tenantId`/`token` vienen siempre de `AuthContext`, nunca hardcodeados.
 */

import { useState } from 'react';
import {
  listAppointments,
  type Appointment,
  type AppointmentStatus,
  type ListAppointmentsQuery,
  type ListAppointmentsResponse,
} from '../api/endpoints';
import { useAuth } from '../auth/AuthContext';
import { useApi } from '../hooks/useApi';
import { AsyncSection } from '../components/ui';
import { DateRangePicker } from '../components/dashboard/DateRangePicker';
import { AppointmentStatusFilter } from '../components/agenda/AppointmentStatusFilter';
import { AppointmentsList } from '../components/agenda/AppointmentsList';

function errorMessage(err: Error): string {
  return err.message || 'Ocurrió un error inesperado.';
}

function toDay(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function defaultRange(): { from: string; to: string } {
  const today = new Date();
  const sixDaysAhead = new Date(today);
  sixDaysAhead.setDate(today.getDate() + 6);
  return { from: toDay(today), to: toDay(sixDaysAhead) };
}

export function AgendaPage(): JSX.Element {
  const { person, token } = useAuth();
  const tenantId = person?.tenantId ?? '';

  const [initialRange] = useState(defaultRange);
  const [range, setRange] = useState<{ from: string; to: string }>(initialRange);
  const [statusFilter, setStatusFilter] = useState<AppointmentStatus[] | undefined>(undefined);
  const [appointments, setAppointments] = useState<Appointment[]>([]);

  const { loading, error, run } = useApi<ListAppointmentsResponse>(
    listAppointments as (...args: unknown[]) => Promise<ListAppointmentsResponse>,
  );

  const fetchAppointments = (
    newRange: { from: string; to: string },
    newStatusFilter: AppointmentStatus[] | undefined,
  ): void => {
    const query: ListAppointmentsQuery = { from: newRange.from, to: newRange.to, status: newStatusFilter };
    run(tenantId, query, token ?? '')
      .then((result) => setAppointments(result.appointments))
      .catch(() => {});
  };

  const handleRangeChange = (newRange: { from: string; to: string }): void => {
    setRange(newRange);
    fetchAppointments(newRange, statusFilter);
  };

  const handleStatusChange = (newStatusFilter: AppointmentStatus[] | undefined): void => {
    setStatusFilter(newStatusFilter);
    fetchAppointments(range, newStatusFilter);
  };

  const handleAppointmentUpdated = (updated: Appointment): void => {
    setAppointments((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-border/80 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-text">Agenda</h1>
          <p className="text-xs text-text-muted mt-1">
            Visualizá y gestioná las citas agendadas por tus clientes.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <DateRangePicker
          initialFrom={initialRange.from}
          initialTo={initialRange.to}
          onChange={handleRangeChange}
        />
        <div className="mb-4 flex flex-col gap-1 text-sm font-medium text-text sm:w-56 w-full">
          Estado
          <AppointmentStatusFilter onChange={handleStatusChange} />
        </div>
      </div>

      <AsyncSection
        loading={loading}
        error={error ? errorMessage(error) : null}
        isEmpty={appointments.length === 0}
        loadingLabel="Cargando agenda..."
        emptyTestId="agenda-empty"
        emptyTitle="No hay citas para este rango"
        emptyMessage="Probá con otro rango de fechas o cambiá el filtro de estado."
      >
        <AppointmentsList
          appointments={appointments}
          tenantId={tenantId}
          token={token ?? ''}
          onAppointmentUpdated={handleAppointmentUpdated}
        />
      </AsyncSection>
    </div>
  );
}
