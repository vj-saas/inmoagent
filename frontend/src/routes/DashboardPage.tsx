/**
 * Dashboard de métricas del tenant.
 *
 * - Calcula el rango por defecto (hoy y hoy-30 días, `YYYY-MM-DD` local) una
 *   sola vez en el init de `useState`.
 * - Invoca `getMetrics(tenantId, { from, to }, token)` vía `useApi` al montar
 *   y cada vez que `DateRangePicker` emite un rango válido nuevo
 *   (`onChange`).
 * - `DateRangePicker` señaliza inválido/válido vía `onValidityChange`; cuando
 *   es inválido no se invoca el endpoint y se muestra el mensaje de
 *   validación en español en vez de la grilla.
 * - Render mutuamente excluyente: mensaje de validación | Spinner | ErrorBanner
 *   | grilla de cinco `MetricCard`.
 * - `tenantId`/`token` vienen siempre de `AuthContext`, nunca hardcodeados.
 * - Pantalla de solo lectura: no importa ninguna función de escritura de
 *   `endpoints.ts`.
 */

import { useState } from 'react';
import { getMetrics, type MetricsResult } from '../api/endpoints';
import { useAuth } from '../auth/AuthContext';
import { useApi } from '../hooks/useApi';
import { AsyncSection } from '../components/ui';
import { DateRangePicker } from '../components/dashboard/DateRangePicker';
import { MetricCard } from '../components/dashboard/MetricCard';

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
  const thirtyDaysAgo = new Date(today);
  thirtyDaysAgo.setDate(today.getDate() - 30);
  return { from: toDay(thirtyDaysAgo), to: toDay(today) };
}

export function DashboardPage(): JSX.Element {
  const { person, token } = useAuth();
  const tenantId = person?.tenantId ?? '';

  const [initialRange] = useState(defaultRange);
  const [, setRange] = useState<{ from: string; to: string }>(initialRange);
  const [isRangeValid, setIsRangeValid] = useState(true);

  const { loading, error, data, run } = useApi<MetricsResult>(
    getMetrics as (...args: unknown[]) => Promise<MetricsResult>,
  );

  const handleChange = (newRange: { from: string; to: string }): void => {
    setRange(newRange);
    run(tenantId, newRange, token ?? '').catch(() => {});
  };

  const handleValidityChange = (valid: boolean): void => {
    setIsRangeValid(valid);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-border/80 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-text">Panel de Control</h1>
          <p className="text-xs text-text-muted mt-1">
            Estadísticas de leads, conversaciones y citas programadas en tiempo real.
          </p>
        </div>

        <div className="flex items-center shrink-0">
          <DateRangePicker
            initialFrom={initialRange.from}
            initialTo={initialRange.to}
            onChange={handleChange}
            onValidityChange={handleValidityChange}
          />
        </div>
      </div>

      {!isRangeValid && (
        <div className="rounded-lg bg-danger/10 p-4 border border-danger/20">
          <p data-testid="range-validation-error" className="text-sm font-semibold text-danger">
            La fecha desde no puede ser posterior a la fecha hasta
          </p>
        </div>
      )}

      {isRangeValid && (
        <AsyncSection
          loading={loading}
          error={error ? errorMessage(error) : null}
          loadingLabel="Cargando métricas..."
        >
          {data && (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-5">
              <MetricCard label="Leads nuevos" value={data.newLeads} />
              <MetricCard label="Conversaciones activas" value={data.activeConversations} />
              <MetricCard label="Handoffs" value={data.handoffs} />
              <MetricCard label="Citas propuestas" value={data.appointments.proposed} />
              <MetricCard label="Citas confirmadas" value={data.appointments.confirmed} />
            </div>
          )}
        </AsyncSection>
      )}
    </div>
  );
}
