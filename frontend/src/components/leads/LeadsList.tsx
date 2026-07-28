import React from 'react';
import type { Lead } from '../../api/endpoints';
import { LeadRow } from './LeadRow';
import { Ledger, LedgerHead, Meta, TableScroll } from '../ui';

export interface LeadsListProps {
  leads: Lead[];
}

/**
 * Bandeja de leads como libro mayor. Mantiene el orden recibido sin reordenar
 * ni filtrar client-side.
 *
 * Cada `LeadRow` es un `Link` que envuelve toda la fila (navegación AC-13),
 * por lo que la lista no puede ser un `<table>` literal (un `<a>` no puede
 * envolver un `<tr>`); igual se apoya en `TableScroll` (mismo wrapper
 * `overflow-x-auto` que usan las vistas tabulares) para cumplir AC-8 si el
 * contenido excede el viewport.
 *
 * Cubre AC-1 (orden recibido), AC-13 (navegación vía LeadRow).
 */
export const LeadsList: React.FC<LeadsListProps> = ({ leads }) => {
  return (
    <TableScroll>
      <Ledger data-testid="leads-list">
        {/* Sin filas no hay encabezado de columnas: un ledger vacío es una
            regla sola, no una tabla con títulos huérfanos. */}
        {leads.length > 0 && (
          <LedgerHead>
            <Meta className="w-16">Señal</Meta>
            <Meta>Lead · estado · filtros capturados</Meta>
            <Meta className="ml-auto">Modo</Meta>
          </LedgerHead>
        )}
        {leads.map((lead) => (
          <LeadRow key={lead.id} lead={lead} />
        ))}
      </Ledger>
    </TableScroll>
  );
};
