import React from 'react';
import { Card, CardBody } from '../ui';
import {
  UserPlus,
  MessageSquare,
  ArrowUpDown,
  CalendarDays,
  CalendarCheck2,
  TrendingUp,
  TrendingDown,
  Minus,
} from 'lucide-react';

export interface MetricCardProps {
  label: string;
  value: number;
  /**
   * Total del mismo indicador en el período anterior de igual longitud
   * (dato real, no estimado). Si no se provee, no se muestra comparación
   * en vez de inventar una tendencia.
   */
  previousValue?: number;
}

const iconMap: Record<string, { icon: React.ComponentType<any>; color: string; bg: string }> = {
  'leads nuevos': { icon: UserPlus, color: 'text-info', bg: 'bg-info/10' },
  'conversaciones activas': { icon: MessageSquare, color: 'text-accent', bg: 'bg-accent/10' },
  'handoffs': { icon: ArrowUpDown, color: 'text-warning', bg: 'bg-warning/10' },
  'citas propuestas': { icon: CalendarDays, color: 'text-text-muted', bg: 'bg-bg' },
  'citas confirmadas': { icon: CalendarCheck2, color: 'text-success', bg: 'bg-success/10' },
};

function Trend({ value, previousValue }: { value: number; previousValue: number }) {
  const delta = value - previousValue;

  if (delta === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-text-faint">
        <Minus className="h-3.5 w-3.5" aria-hidden="true" />
        Sin variación vs. período anterior
      </span>
    );
  }

  const pct = previousValue > 0 ? Math.round((delta / previousValue) * 100) : 100;
  const isUp = delta > 0;
  const Icon = isUp ? TrendingUp : TrendingDown;
  const tone = isUp ? 'text-success' : 'text-danger';

  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-semibold ${tone}`}
      aria-label={`${isUp ? 'Aumentó' : 'Bajó'} un ${Math.abs(pct)}% respecto al período anterior`}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {isUp ? '+' : ''}
      {pct}% vs. período anterior
    </span>
  );
}

export const MetricCard: React.FC<MetricCardProps> = ({ label, value, previousValue }) => {
  const normalizedLabel = label.toLowerCase().trim();
  const config = iconMap[normalizedLabel] || { icon: UserPlus, color: 'text-accent', bg: 'bg-accent/10' };
  const IconComponent = config.icon;

  return (
    <Card tone="raised" data-testid="metric-card" className="transition-all duration-200">
      <CardBody className="p-6">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <span className="block text-xs font-bold uppercase tracking-wider text-text-muted">
              {label}
            </span>
            <div className="text-3xl font-extrabold tracking-tight text-text">
              {value}
            </div>
          </div>
          <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${config.bg} ${config.color} shadow-sm`}>
            <IconComponent className="h-6 w-6" />
          </div>
        </div>

        <div className="mt-3 border-t border-border pt-3">
          {previousValue !== undefined ? (
            <Trend value={value} previousValue={previousValue} />
          ) : (
            <span className="text-xs text-text-faint">Sin datos del período anterior</span>
          )}
        </div>
      </CardBody>
    </Card>
  );
};
