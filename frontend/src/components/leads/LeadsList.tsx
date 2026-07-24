import React from 'react';
import type { Lead } from '../../api/endpoints';
import { LeadRow } from './LeadRow';

export interface LeadsListProps {
  leads: Lead[];
}

/**
 * Renderiza una lista de leads como filas. Cada fila es un LeadRow.
 * Mantiene el orden recibido sin reordenar ni filtrar client-side.
 *
 * Cubre AC-1 (orden recibido), AC-13 (navegación vía LeadRow).
 */
export const LeadsList: React.FC<LeadsListProps> = ({ leads }) => {
  return (
    <div data-testid="leads-list">
      {leads.map((lead) => (
        <LeadRow key={lead.id} lead={lead} />
      ))}
    </div>
  );
};
