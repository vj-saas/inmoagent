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
import { Spinner } from '../components/Spinner';
import { ErrorBanner } from '../components/ErrorBanner';
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
    <div>
      <h1>Panel</h1>

      <DateRangePicker
        initialFrom={initialRange.from}
        initialTo={initialRange.to}
        onChange={handleChange}
        onValidityChange={handleValidityChange}
      />

      {!isRangeValid && (
        <p data-testid="range-validation-error">
          La fecha desde no puede ser posterior a la fecha hasta
        </p>
      )}

      {isRangeValid && loading && <Spinner text="Cargando métricas..." />}

      {isRangeValid && !loading && error && <ErrorBanner message={errorMessage(error)} />}

      {isRangeValid && !loading && !error && data && (
        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginTop: '16px' }}>
          <MetricCard label="Leads nuevos" value={data.newLeads} />
          <MetricCard label="Conversaciones activas" value={data.activeConversations} />
          <MetricCard label="Handoffs" value={data.handoffs} />
          <MetricCard label="Citas propuestas" value={data.appointments.proposed} />
          <MetricCard label="Citas confirmadas" value={data.appointments.confirmed} />
        </div>
      )}
    </div>
  );
}
