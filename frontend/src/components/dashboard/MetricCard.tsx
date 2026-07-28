import React from 'react';
import { Slab, Meta, Num } from '../ui';
import { cn } from '../../lib/cn';

export interface MetricCardProps {
  label: string;
  value: number;
  /**
   * Total del mismo indicador en el período anterior de igual longitud
   * (dato real, no estimado). Si no se provee, no se muestra comparación
   * en vez de inventar una tendencia.
   */
  previousValue?: number;
  /**
   * `hero`: la métrica protagonista de la pantalla — bloque invertido y
   * cifra a tamaño de titular. Solo una por pantalla, por definición.
   * `row`: el resto, en el ticker de la derecha.
   */
  emphasis?: 'hero' | 'row';
}

/**
 * Métrica del panel. Sin ícono, sin caja flotante, sin sparkline decorativo:
 * la cifra ES el gráfico. El contraste de escala entre la métrica héroe y las
 * secundarias es lo que convierte cinco números sueltos en una lectura con
 * jerarquía ("hoy lo que importa es esto").
 *
 * La comparación contra el período anterior se escribe en monoespaciada con
 * un triángulo macizo, no con un ícono de librería: es un dato tabular más.
 */
function Trend({
  value,
  previousValue,
  hero,
}: {
  value: number;
  previousValue: number;
  hero: boolean;
}) {
  const delta = value - previousValue;

  if (delta === 0) {
    return (
      <span className={cn('u-meta', hero ? 'text-on-invert/70' : 'text-text-faint')}>
        = Sin variación vs. período anterior
      </span>
    );
  }

  const pct = previousValue > 0 ? Math.round((delta / previousValue) * 100) : 100;
  const isUp = delta > 0;

  return (
    <span
      className={cn('u-meta', hero ? 'text-accent-loud' : isUp ? 'text-success' : 'text-danger')}
      aria-label={`${isUp ? 'Aumentó' : 'Bajó'} un ${Math.abs(pct)}% respecto al período anterior`}
    >
      {isUp ? '▲' : '▼'} {isUp ? '+' : ''}
      {pct}% vs. período anterior
    </span>
  );
}

export const MetricCard: React.FC<MetricCardProps> = ({
  label,
  value,
  previousValue,
  emphasis = 'row',
}) => {
  const hero = emphasis === 'hero';

  return (
    <Slab
      data-testid="metric-card"
      tone={hero ? 'ink' : 'bare'}
      rule={hero ? 'accent' : 'hairline'}
      className={cn('flex flex-col justify-between', hero ? 'min-h-[15rem] p-6' : 'gap-3 p-4')}
    >
      <Meta as="div" muted={false} className={hero ? 'text-on-invert' : 'text-text-muted'}>
        {label}
      </Meta>

      <div className={cn('flex items-end', hero ? 'mt-6' : 'mt-1')}>
        <Num variant={hero ? 'hero' : 'display'} reveal className={hero ? 'text-on-invert' : ''}>
          {value}
        </Num>
      </div>

      <div className={cn('mt-3 border-t pt-2', hero ? 'border-on-invert/25' : 'border-border')}>
        {previousValue !== undefined ? (
          <Trend value={value} previousValue={previousValue} hero={hero} />
        ) : (
          <span className={cn('u-meta', hero ? 'text-on-invert/70' : 'text-text-faint')}>
            Sin datos del período anterior
          </span>
        )}
      </div>
    </Slab>
  );
};
