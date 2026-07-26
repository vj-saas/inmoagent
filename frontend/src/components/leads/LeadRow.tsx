import React from 'react';
import { Link } from 'react-router-dom';
import type { Lead } from '../../api/endpoints';
import { LeadChips } from './LeadChips';
import { LeadModeBadge } from './LeadModeBadge';

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
    <Link to={`/leads/${lead.id}`} data-testid={`lead-row-${lead.id}`} className="block no-underline text-inherit">
      <div
        data-testid="lead-row"
        className="flex cursor-pointer flex-col gap-2 border-b border-border p-3 transition-colors hover:bg-bg"
      >
        <div className="flex items-start justify-between">
          <div>
            <div data-testid="lead-name" className="text-sm font-semibold text-text">
              {displayName}
            </div>
            <div data-testid="lead-state" className="mt-1 text-xs text-text-muted">
              {lead.state}
            </div>
          </div>
          <LeadModeBadge state={lead.state} />
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
