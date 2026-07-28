import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import type { AssignableUser, Lead, LeadNote } from '../../api/endpoints';
import { LeadChips } from './LeadChips';
import { ContactedToggle } from './ContactedToggle';
import { AssignmentControl } from './AssignmentControl';
import { NoteForm } from './NoteForm';
import { LedgerRow, Meta, Button, type LedgerSignal } from '../ui';

export interface CallQueueRowProps {
  lead: Lead;
  assignableUsers: AssignableUser[];
  tenantId: string;
  token: string;
  onUpdated: (lead: Lead) => void;
}

/** Minutos que el lead lleva esperando una persona, si está en handoff. */
function waitingMinutes(lead: Lead): number | null {
  if (lead.state !== 'HUMAN_HANDOFF' || !lead.handoffAt) return null;
  const elapsed = Date.now() - new Date(lead.handoffAt).getTime();
  if (!Number.isFinite(elapsed) || elapsed < 0) return null;
  return Math.floor(elapsed / 60000);
}

/**
 * Señal de urgencia de la fila (los mismos tres tonos que define el handoff
 * de SLA): el que pidió un humano y espera hace rato es crítico, el que
 * acaba de pedirlo todavía está a tiempo, y el tibio en calificación es
 * advertencia. Sin `handoffAt` se asume lo peor: pidió humano y no sabemos
 * desde cuándo.
 */
function resolveSignal(lead: Lead): LedgerSignal {
  if (lead.state !== 'HUMAN_HANDOFF') return 'warning';
  const minutes = waitingMinutes(lead);
  if (minutes === null) return 'critical';
  if (minutes > 15) return 'critical';
  if (minutes >= 5) return 'warning';
  return 'ok';
}

/**
 * Fila de la cola de "llamar hoy". Es una entrada de libro mayor, no una
 * card: barra maciza de urgencia a la izquierda, teléfono y tiempo de espera
 * en monoespaciada alineados en columna, e inversión completa al hacer hover.
 *
 * Al expandir ofrece las acciones para registrar el resultado de la llamada
 * (contactado, asignación + próxima acción, nota), reusando los mismos
 * componentes que la ficha del lead en vez de duplicar lógica de escritura.
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
  const minutes = waitingMinutes(lead);

  // Al expandir, la fila deja de invertirse en hover: el formulario de
  // registro de llamada vive adentro y necesita el fondo de papel para que
  // los controles heredados sigan legibles.
  return (
    <LedgerRow data-testid="call-queue-row" signal={resolveSignal(lead)} inert={expanded}>
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <Link
              to={`/leads/${lead.id}`}
              data-testid="call-queue-row-link"
              className="group/link relative"
            >
              <span
                data-testid="call-queue-row-name"
                className="font-mono text-base font-medium tracking-tight"
              >
                {displayName}
              </span>
              <span
                aria-hidden="true"
                className="u-wipe-line origin-left scale-x-0 transition-transform duration-200 ease-out group-hover/link:scale-x-100"
              />
            </Link>

            <Meta
              as="span"
              data-testid="call-queue-row-state"
              className="text-text-faint group-hover:text-inherit"
            >
              {lead.state}
            </Meta>

            {minutes !== null && (
              <Meta as="span" className="text-danger group-hover:text-inherit">
                {minutes} min esperando
              </Meta>
            )}
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
          variant={expanded ? 'primary' : 'secondary'}
          data-testid="call-queue-row-toggle"
          onClick={() => setExpanded((prev) => !prev)}
        >
          {expanded ? 'Cerrar' : 'Registrar llamada'}
        </Button>
      </div>

      {expanded && (
        <div
          data-testid="call-queue-row-actions"
          className="mt-4 flex flex-col gap-4 border-l-2 border-accent-loud bg-surface p-4"
        >
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
    </LedgerRow>
  );
};
