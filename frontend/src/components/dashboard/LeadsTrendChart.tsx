import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Slab, SlabHead, SlabBody, Meta } from '../ui';

export interface TrendDatum {
  label: string;
  current: number;
  previous: number;
}

export interface LeadsTrendChartProps {
  data: TrendDatum[];
}

const MONO = "'IBM Plex Mono', ui-monospace, monospace";

/**
 * Comparación de métricas clave contra el período anterior de igual longitud.
 * Usa únicamente datos reales (dos llamadas a `getMetrics` con rangos
 * distintos) — no hay endpoint de series diarias en el backend, así que no se
 * fabrica una curva día a día.
 *
 * Gráfico sin cromo: se le sacaron grilla, caja de leyenda, ejes decorativos
 * y esquinas redondeadas. Quedan las barras macizas, una línea de base, y una
 * leyenda tipográfica propia fuera del SVG (en mono, como cualquier otro
 * metadato del sistema). Lo que se lee es el dato, no el contenedor.
 */
export function LeadsTrendChart({ data }: LeadsTrendChartProps) {
  const summary = data
    .map((d) => `${d.label}: ${d.current} este período, ${d.previous} el anterior`)
    .join('. ');

  return (
    <Slab rule="ink">
      <SlabHead>
        <div>
          <Meta muted={false}>Comparación con el período anterior</Meta>
          <p className="mt-1 text-xs text-text-muted">
            Totales del rango seleccionado frente al mismo rango inmediatamente anterior.
          </p>
        </div>

        {/* Leyenda tipográfica: dos bloques macizos y sus rótulos en mono. */}
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 bg-chart-primary" aria-hidden="true" />
            <Meta>Este período</Meta>
          </span>
          <span className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 bg-chart-muted" aria-hidden="true" />
            <Meta>Período anterior</Meta>
          </span>
        </div>
      </SlabHead>

      <SlabBody className="p-4 pt-6">
        <div role="img" aria-label={summary} className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }} barGap={2}>
              <XAxis
                dataKey="label"
                tick={{ fill: 'var(--color-text-muted)', fontSize: 10, fontFamily: MONO }}
                axisLine={{ stroke: 'var(--color-border-strong)', strokeWidth: 2 }}
                tickLine={false}
                interval={0}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fill: 'var(--color-text-faint)', fontSize: 10, fontFamily: MONO }}
                axisLine={false}
                tickLine={false}
                width={28}
              />
              <Tooltip
                cursor={{ fill: 'var(--color-border)', fillOpacity: 0.35 }}
                contentStyle={{
                  background: 'var(--color-surface)',
                  border: '2px solid var(--color-border-strong)',
                  borderRadius: 0,
                  fontFamily: MONO,
                  fontSize: 11,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                }}
              />
              <Bar dataKey="previous" name="Período anterior" fill="var(--color-chart-muted)" />
              <Bar dataKey="current" name="Este período" fill="var(--color-chart-primary)" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </SlabBody>
    </Slab>
  );
}
