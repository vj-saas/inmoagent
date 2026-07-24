import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import type { AssignableUser, Lead, LeadNote } from '../../api/endpoints';
import { LeadChips } from './LeadChips';
import { ContactedToggle } from './ContactedToggle';
import { AssignmentControl } from './AssignmentControl';
import { NoteForm } from './NoteForm';

export interface CallQueueRowProps {
  lead: Lead;
  assignableUsers: AssignableUser[];
  tenantId: string;
  token: string;
  onUpdated: (lead: Lead) => void;
}

/**
 * Fila de la cola de "llamar hoy". Muestra los datos básicos del lead y, al
 * expandir, ofrece las acciones para registrar el resultado de la llamada:
 * marcar contactado/no contactado, asignar responsable + próxima acción
 * (`nextActionAt`), y dejar una nota interna. Reusa los mismos componentes
 * que la ficha del lead (A.4) en vez de duplicar lógica de escritura.
 */
export const CallQueueRow: React.FC<CallQueueRowProps> = ({
  lead,
  assignableUsers,
  tenantId,
  token,
  onUpdated,
}) => {
  const [expanded, setExpanded] = useState(false);
  const displayName = lead.name || lead.phone;

  return (
    <div data-testid="call-queue-row" style={{ padding: '12px', borderBottom: '1px solid #e5e7eb' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <Link to={`/leads/${lead.id}`} data-testid="call-queue-row-link">
            <span data-testid="call-queue-row-name" style={{ fontWeight: 600 }}>
              {displayName}
            </span>
          </Link>
          <div data-testid="call-queue-row-state" style={{ fontSize: '12px', color: '#6b7280' }}>
            {lead.state}
          </div>
          <LeadChips
            fOperation={lead.fOperation}
            fNeighborhoods={lead.fNeighborhoods}
            fMaxPrice={lead.fMaxPrice}
            fCurrency={lead.fCurrency}
            fMinRooms={lead.fMinRooms}
          />
        </div>
        <button
          type="button"
          data-testid="call-queue-row-toggle"
          onClick={() => setExpanded((prev) => !prev)}
        >
          {expanded ? 'Cerrar' : 'Registrar llamada'}
        </button>
      </div>

      {expanded && (
        <div data-testid="call-queue-row-actions" style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <ContactedToggle lead={lead} tenantId={tenantId} token={token} onUpdated={onUpdated} />
          <AssignmentControl
            lead={lead}
            assignableUsers={assignableUsers}
            tenantId={tenantId}
            leadId={lead.id}
            token={token}
            onUpdated={onUpdated}
          />
          <NoteForm
            tenantId={tenantId}
            leadId={lead.id}
            token={token}
            onCreated={(_note: LeadNote) => {
              // La nota queda persistida en el backend; la ficha del lead
              // (A.4) es donde se lee el historial completo de notas.
            }}
          />
        </div>
      )}
    </div>
  );
};
