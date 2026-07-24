import React from 'react';
import { Card, CardBody } from '../ui';

export interface MetricCardProps {
  label: string;
  value: number;
}

export const MetricCard: React.FC<MetricCardProps> = ({ label, value }) => {
  return (
    <Card data-testid="metric-card">
      <CardBody>
        <div className="mb-2 text-sm font-medium uppercase tracking-wide text-text-muted">
          {label}
        </div>
        <div className="text-3xl font-bold text-text">{value}</div>
      </CardBody>
    </Card>
  );
};
