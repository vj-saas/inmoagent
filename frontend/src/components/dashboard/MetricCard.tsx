import React from 'react';

export interface MetricCardProps {
  label: string;
  value: number;
}

export const MetricCard: React.FC<MetricCardProps> = ({ label, value }) => {
  const cardStyles: React.CSSProperties = {
    backgroundColor: '#fff',
    border: '1px solid #ddd',
    borderRadius: '8px',
    padding: '16px',
    minWidth: '200px',
    boxShadow: '0 2px 4px rgba(0, 0, 0, 0.05)',
  };

  const labelStyles: React.CSSProperties = {
    fontSize: '14px',
    color: '#666',
    marginBottom: '8px',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    fontWeight: '500',
  };

  const valueStyles: React.CSSProperties = {
    fontSize: '32px',
    fontWeight: 'bold',
    color: '#333',
  };

  return (
    <div style={cardStyles} data-testid="metric-card">
      <div style={labelStyles}>{label}</div>
      <div style={valueStyles}>{value}</div>
    </div>
  );
};
