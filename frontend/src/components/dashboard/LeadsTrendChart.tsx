import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, CardBody, CardHeader } from '../ui';

export interface TrendDatum {
  label: string;
  current: number;
  previous: number;
}

export interface LeadsTrendChartProps {
  data: TrendDatum[];
}

/**
 * Comparación de métricas clave contra el período anterior de igual
 * longitud. Usa únicamente datos reales (dos llamadas a `getMetrics` con
 * rangos distintos) — no hay endpoint de series diarias en el backend, así
 * que no se fabrica una curva día a día.
 */
export function LeadsTrendChart({ data }: LeadsTrendChartProps) {
  const summary = data
    .map((d) => `${d.label}: ${d.current} este período, ${d.previous} el anterior`)
    .join('. ');

  return (
    <Card tone="raised">
      <CardHeader>
        <h2 className="text-sm font-semibold text-text">Comparación con el período anterior</h2>
        <p className="mt-0.5 text-xs text-text-muted">
          Totales del rango seleccionado frente al mismo rango inmediatamente anterior.
        </p>
      </CardHeader>
      <CardBody>
        <div role="img" aria-label={summary} className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-chart-grid)" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fill: 'var(--color-text-muted)', fontSize: 12 }}
                axisLine={{ stroke: 'var(--color-chart-grid)' }}
                tickLine={false}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fill: 'var(--color-text-muted)', fontSize: 12 }}
                axisLine={false}
                tickLine={false}
                width={32}
              />
              <Tooltip
                contentStyle={{
                  background: 'var(--color-surface)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 8,
                  fontSize: 12,
                }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="previous" name="Período anterior" fill="var(--color-chart-muted)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="current" name="Este período" fill="var(--color-chart-primary)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardBody>
    </Card>
  );
}
