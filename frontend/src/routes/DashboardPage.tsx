/**
 * Dashboard de métricas del tenant.
 *
 * - Calcula el rango por defecto (hoy y hoy-30 días, `YYYY-MM-DD` local) una
 *   sola vez en el init de `useState`.
 * - Invoca `getMetrics(tenantId, { from, to }, token)` vía `useApi` al montar
 *   y cada vez que `DateRangePicker` emite un rango válido nuevo
 *   (`onChange`), y en paralelo invoca el mismo endpoint con el período
 *   inmediatamente anterior de igual longitud (dato real, no estimado) para
 *   poder mostrar una comparación honesta en vez de fabricar una tendencia
 *   diaria que el backend no expone.
 * - `DateRangePicker` señaliza inválido/válido vía `onValidityChange`; cuando
 *   es inválido no se invoca el endpoint y se muestra el mensaje de
 *   validación en español en vez de la grilla.
 * - Render mutuamente excluyente: mensaje de validación | Spinner | ErrorBanner
 *   | grilla de cinco `MetricCard` + gráfico de comparación.
 * - `tenantId`/`token` vienen siempre de `AuthContext`, nunca hardcodeados.
 * - Pantalla de solo lectura: no importa ninguna función de escritura de
 *   `endpoints.ts`.
 */

import { useState } from 'react';
import { getMetrics, type MetricsResult } from '../api/endpoints';
import { useAuth } from '../auth/AuthContext';
import { useApi } from '../hooks/useApi';
import { AsyncSection, SectionHead } from '../components/ui';
import { DateRangePicker } from '../components/dashboard/DateRangePicker';
import { MetricCard } from '../components/dashboard/MetricCard';
import { LeadsTrendChart, type TrendDatum } from '../components/dashboard/LeadsTrendChart';

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

/** Período inmediatamente anterior, de igual longitud que `range`. */
function previousRange(range: { from: string; to: string }): { from: string; to: string } {
  const fromDate = new Date(range.from);
  const toDate = new Date(range.to);
  const spanMs = toDate.getTime() - fromDate.getTime();
  const prevTo = new Date(fromDate.getTime() - 1);
  const prevFrom = new Date(prevTo.getTime() - spanMs);
  return { from: prevFrom.toISOString(), to: prevTo.toISOString() };
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
  const { loading: previousLoading, data: previousData, run: runPrevious } = useApi<MetricsResult>(
    getMetrics as (...args: unknown[]) => Promise<MetricsResult>,
  );

  const handleChange = (newRange: { from: string; to: string }): void => {
    setRange(newRange);
    run(tenantId, newRange, token ?? '').catch(() => {});
    runPrevious(tenantId, previousRange(newRange), token ?? '').catch(() => {});
  };

  const handleValidityChange = (valid: boolean): void => {
    setIsRangeValid(valid);
  };

  const trendData: TrendDatum[] | null =
    data && previousData
      ? [
          { label: 'Leads nuevos', current: data.newLeads, previous: previousData.newLeads },
          {
            label: 'Conversaciones activas',
            current: data.activeConversations,
            previous: previousData.activeConversations,
          },
          { label: 'Handoffs', current: data.handoffs, previous: previousData.handoffs },
          {
            label: 'Citas propuestas',
            current: data.appointments.proposed,
            previous: previousData.appointments.proposed,
          },
          {
            label: 'Citas confirmadas',
            current: data.appointments.confirmed,
            previous: previousData.appointments.confirmed,
          },
        ]
      : null;

  return (
    <div className="space-y-8">
      <SectionHead
        index="01"
        title="Panel de control"
        kicker="Métricas del período"
        description="Leads, conversaciones y citas del rango seleccionado, comparadas contra el período inmediatamente anterior."
        actions={
          <DateRangePicker
            initialFrom={initialRange.from}
            initialTo={initialRange.to}
            onChange={handleChange}
            onValidityChange={handleValidityChange}
          />
        }
      />

      {!isRangeValid && (
        <div className="flex items-stretch border border-danger/40 bg-danger/10">
          <span className="u-meta flex items-center bg-danger px-2 text-white" aria-hidden="true">
            Rango
          </span>
          <p data-testid="range-validation-error" className="px-4 py-3 text-sm text-danger">
            La fecha desde no puede ser posterior a la fecha hasta
          </p>
        </div>
      )}

      {isRangeValid && (
        <AsyncSection
          loading={loading || previousLoading}
          error={error ? errorMessage(error) : null}
          loadingLabel="Cargando métricas..."
        >
          {data && (
            <div className="space-y-10">
              {/*
                Portada editorial, no grilla de cinco cards iguales: la métrica
                que define el día ocupa un bloque invertido de cinco columnas y
                el resto corre como un ticker de dos por dos a la derecha. La
                jerarquía la hace el contraste de escala, no el color.
              */}
              <div className="grid grid-cols-1 gap-x-10 gap-y-6 lg:grid-cols-12">
                <div className="lg:col-span-5">
                  <MetricCard
                    label="Leads nuevos"
                    value={data.newLeads}
                    previousValue={previousData?.newLeads}
                    emphasis="hero"
                  />
                </div>

                <div className="grid grid-cols-1 gap-x-8 gap-y-2 sm:grid-cols-2 lg:col-span-7">
                  <MetricCard
                    label="Conversaciones activas"
                    value={data.activeConversations}
                    previousValue={previousData?.activeConversations}
                  />
                  <MetricCard
                    label="Handoffs"
                    value={data.handoffs}
                    previousValue={previousData?.handoffs}
                  />
                  <MetricCard
                    label="Citas propuestas"
                    value={data.appointments.proposed}
                    previousValue={previousData?.appointments.proposed}
                  />
                  <MetricCard
                    label="Citas confirmadas"
                    value={data.appointments.confirmed}
                    previousValue={previousData?.appointments.confirmed}
                  />
                </div>
              </div>

              {trendData && <LeadsTrendChart data={trendData} />}
            </div>
          )}
        </AsyncSection>
      )}
    </div>
  );
}
