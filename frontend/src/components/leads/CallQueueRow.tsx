import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import type { AssignableUser, Lead, LeadNote } from '../../api/endpoints';
import { LeadChips } from './LeadChips';
import { ContactedToggle } from './ContactedToggle';
import { AssignmentControl } from './AssignmentControl';
import { NoteForm } from './NoteForm';
import { Card, CardBody, Button } from '../ui';

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
    <Card data-testid="call-queue-row">
      <CardBody>
        <div className="flex items-start justify-between gap-3">
          <div>
            <Link to={`/leads/${lead.id}`} data-testid="call-queue-row-link">
              <span data-testid="call-queue-row-name" className="font-semibold text-text">
                {displayName}
              </span>
            </Link>
            <div data-testid="call-queue-row-state" className="text-xs text-text-muted">
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
          <Button
            type="button"
            size="sm"
            variant="secondary"
            data-testid="call-queue-row-toggle"
            onClick={() => setExpanded((prev) => !prev)}
          >
            {expanded ? 'Cerrar' : 'Registrar llamada'}
          </Button>
        </div>

        {expanded && (
          <div data-testid="call-queue-row-actions" className="mt-3 flex flex-col gap-3">
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
      </CardBody>
    </Card>
  );
};
