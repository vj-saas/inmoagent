import React from 'react';
import { Link } from 'react-router-dom';
import type { Lead } from '../../api/endpoints';
import { LeadChips } from './LeadChips';

export interface LeadRowProps {
  lead: Lead;
}

/**
 * Renderiza una fila de la bandeja de leads. Muestra los datos básicos del lead
 * (nombre o teléfono, estado) e integra LeadChips con los filtros capturados.
 * Toda la fila es un Link hacia /leads/:leadId.
 *
 * Cubre AC-1, AC-13, e integra AC-8/AC-9 vía LeadChips.
 */
export const LeadRow: React.FC<LeadRowProps> = ({ lead }) => {
  // Mostrar nombre si existe, sino el teléfono
  const displayName = lead.name || lead.phone;

  return (
    <Link
      to={`/leads/${lead.id}`}
      data-testid={`lead-row-${lead.id}`}
      style={{ textDecoration: 'none', color: 'inherit' }}
    >
      <div
        data-testid="lead-row"
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          padding: '12px',
          borderBottom: '1px solid #e5e7eb',
          cursor: 'pointer',
          transition: 'background-color 0.2s',
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLDivElement).style.backgroundColor = '#f9fafb';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLDivElement).style.backgroundColor = 'transparent';
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div
              data-testid="lead-name"
              style={{
                fontSize: '14px',
                fontWeight: '600',
                color: '#1f2937',
              }}
            >
              {displayName}
            </div>
            <div
              data-testid="lead-state"
              style={{
                fontSize: '12px',
                color: '#6b7280',
                marginTop: '4px',
              }}
            >
              {lead.state}
            </div>
          </div>
        </div>
        <div>
          <LeadChips
            fOperation={lead.fOperation}
            fNeighborhoods={lead.fNeighborhoods}
            fMaxPrice={lead.fMaxPrice}
            fCurrency={lead.fCurrency}
            fMinRooms={lead.fMinRooms}
          />
        </div>
      </div>
    </Link>
  );
};
