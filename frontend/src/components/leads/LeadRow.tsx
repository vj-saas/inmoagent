import React from 'react';
import { Link } from 'react-router-dom';
import type { Lead } from '../../api/endpoints';
import { LeadChips } from './LeadChips';
import { LeadModeBadge } from './LeadModeBadge';
import { LedgerRow, Meta, type LedgerSignal } from '../ui';

export interface LeadRowProps {
  lead: Lead;
}

/**
 * Señal de la fila según el estado de la FSM: quien pidió una persona es
 * crítico, quien todavía se está calificando es advertencia, quien ya está
 * viendo fichas o agendando va en verde, y el dado de baja queda inactivo.
 */
const STATE_SIGNAL: Record<string, LedgerSignal> = {
  HUMAN_HANDOFF: 'critical',
  GREETING: 'warning',
  QUALIFICATION: 'warning',
  SEARCH_MATCH: 'ok',
  SCHEDULING: 'ok',
  OPTED_OUT: 'idle',
};

/**
 * Fila de la bandeja de leads: entrada de libro mayor, no tarjeta. Toda la
 * fila es un Link hacia /leads/:leadId y se invierte al hacer hover, igual
 * que en la cola de llamados.
 *
 * Cubre AC-1, AC-13, e integra AC-8/AC-9 vía LeadChips.
 */
export const LeadRow: React.FC<LeadRowProps> = ({ lead }) => {
  const displayName = lead.name || lead.phone;

  return (
    <Link
      to={`/leads/${lead.id}`}
      data-testid={`lead-row-${lead.id}`}
      className="block text-inherit no-underline"
    >
      <LedgerRow data-testid="lead-row" signal={STATE_SIGNAL[lead.state] ?? 'idle'}>
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span
                data-testid="lead-name"
                className="font-mono text-base font-medium tracking-tight"
              >
                {displayName}
              </span>
              <Meta
                as="span"
                data-testid="lead-state"
                className="text-text-faint group-hover:text-inherit"
              >
                {lead.state}
              </Meta>
            </div>

            <LeadChips
              fOperation={lead.fOperation}
              fNeighborhoods={lead.fNeighborhoods}
              fMaxPrice={lead.fMaxPrice}
              fCurrency={lead.fCurrency}
              fMinRooms={lead.fMinRooms}
            />
          </div>

          <div className="shrink-0">
            <LeadModeBadge state={lead.state} />
          </div>
        </div>
      </LedgerRow>
    </Link>
  );
};
