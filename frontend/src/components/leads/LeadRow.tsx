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
    <Link to={`/leads/${lead.id}`} data-testid={`lead-row-${lead.id}`} className="block no-underline text-inherit mb-3 last:mb-0">
      <div
        data-testid="lead-row"
        className="flex cursor-pointer flex-col gap-3 rounded-xl border border-border/80 bg-surface p-4 shadow-xs transition-all duration-200 hover:shadow-md hover:border-text/10 hover:translate-y-[-1px]"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-0.5">
            <div data-testid="lead-name" className="text-sm font-semibold text-text">
              {displayName}
            </div>
            <div data-testid="lead-state" className="text-[11px] font-bold text-text-muted tracking-wider uppercase">
              {lead.state}
            </div>
          </div>
          <div className="shrink-0">
            <LeadModeBadge state={lead.state} />
          </div>
        </div>
        {/* Render chips container only if chips exist */}
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
