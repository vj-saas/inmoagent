import React from 'react';
import { Card, CardBody } from '../ui';
import { 
  UserPlus, 
  MessageSquare, 
  ArrowUpDown, 
  CalendarDays, 
  CalendarCheck2 
} from 'lucide-react';

export interface MetricCardProps {
  label: string;
  value: number;
}

const iconMap: Record<string, { icon: React.ComponentType<any>; color: string; bg: string }> = {
  'leads nuevos': { icon: UserPlus, color: 'text-info', bg: 'bg-info/10' },
  'conversaciones activas': { icon: MessageSquare, color: 'text-accent', bg: 'bg-accent/10' },
  'handoffs': { icon: ArrowUpDown, color: 'text-warning', bg: 'bg-warning/10' },
  'citas propuestas': { icon: CalendarDays, color: 'text-text-muted', bg: 'bg-stone-100' },
  'citas confirmadas': { icon: CalendarCheck2, color: 'text-success', bg: 'bg-success/10' },
};

export const MetricCard: React.FC<MetricCardProps> = ({ label, value }) => {
  const normalizedLabel = label.toLowerCase().trim();
  const config = iconMap[normalizedLabel] || { icon: UserPlus, color: 'text-primary', bg: 'bg-primary/10' };
  const IconComponent = config.icon;

  return (
    <Card data-testid="metric-card" className="border-border/60 hover:shadow-md transition-all duration-300">
      <CardBody className="p-6">
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-1">
            <span className="text-xs font-bold uppercase tracking-wider text-text-muted">
              {label}
            </span>
            <div className="text-3xl font-extrabold tracking-tight text-text">
              {value}
            </div>
          </div>
          <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${config.bg} ${config.color} shadow-xs`}>
            <IconComponent className="h-6 w-6" />
          </div>
        </div>
      </CardBody>
    </Card>
  );
};
