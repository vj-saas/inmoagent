import React from 'react';
import type { Lead } from '../../api/endpoints';
import { LeadRow } from './LeadRow';
import { TableScroll } from '../ui';

export interface LeadsListProps {
  leads: Lead[];
}

/**
 * Renderiza una lista de leads como filas. Cada fila es un LeadRow.
 * Mantiene el orden recibido sin reordenar ni filtrar client-side.
 *
 * Cada `LeadRow` es un `Link` que envuelve toda la fila (navegación AC-13),
 * por lo que esta lista usa un `div` de tarjetas en vez de un `<table>`
 * literal (un `<a>` no puede envolver un `<tr>`); igual se apoya en
 * `TableScroll` (mismo wrapper `overflow-x-auto` que usan las vistas
 * tabulares) para cumplir AC-8 si el contenido excede el viewport.
 *
 * Cubre AC-1 (orden recibido), AC-13 (navegación vía LeadRow).
 */
export const LeadsList: React.FC<LeadsListProps> = ({ leads }) => {
  return (
    <TableScroll>
      <div data-testid="leads-list">
        {leads.map((lead) => (
          <LeadRow key={lead.id} lead={lead} />
        ))}
      </div>
    </TableScroll>
  );
};
