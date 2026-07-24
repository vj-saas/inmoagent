/**
 * Cola de "llamar hoy" (Fase B.3).
 *
 * - Lista los leads calificados que pidieron humano (`HUMAN_HANDOFF`) o
 *   quedaron tibios en calificación (`QUALIFICATION`), excluyendo los que ya
 *   fueron marcados como contactados hoy (siguen viéndose una vez pasado el
 *   día porque `contactedAt` no se resetea automáticamente — es responsable
 *   humano volver a marcarlos si corresponde).
 * - Orden de prioridad: `HUMAN_HANDOFF` primero (pidieron explícitamente un
 *   humano), luego `QUALIFICATION`; dentro de cada grupo, más reciente
 *   primero (`lastMessageAt` desc, ya es el orden que entrega el backend).
 * - Cada fila permite expandir y registrar el resultado de la llamada
 *   (contactado, asignación + próxima acción, nota) sin salir de la pantalla.
 */

import { useEffect, useState } from 'react';
import {
  listAssignableUsers,
  listLeads,
  type AssignableUser,
  type ConversationState,
  type Lead,
  type ListLeadsResponse,
} from '../api/endpoints';
import { useAuth } from '../auth/AuthContext';
import { useApi } from '../hooks/useApi';
import { Spinner } from '../components/Spinner';
import { ErrorBanner } from '../components/ErrorBanner';
import { CallQueueRow } from '../components/leads/CallQueueRow';

const QUEUE_STATES: ConversationState[] = ['HUMAN_HANDOFF', 'QUALIFICATION'];

function errorMessage(err: Error): string {
  return err.message || 'Ocurrió un error inesperado.';
}

function priorityRank(state: ConversationState): number {
  return state === 'HUMAN_HANDOFF' ? 0 : 1;
}

export function CallQueuePage(): JSX.Element {
  const { person, token } = useAuth();
  const tenantId = person?.tenantId ?? '';
  const authToken = token ?? '';

  const [leads, setLeads] = useState<Lead[]>([]);

  const leadsApi = useApi<ListLeadsResponse>(
    listLeads as (...args: unknown[]) => Promise<ListLeadsResponse>,
  );
  const assignableApi = useApi<{ users: AssignableUser[] }>(
    listAssignableUsers as (...args: unknown[]) => Promise<{ users: AssignableUser[] }>,
  );

  useEffect(() => {
    if (!tenantId) return;

    leadsApi
      .run(tenantId, { state: QUEUE_STATES }, authToken)
      .then((result) => {
        const sorted = [...(result.leads as Lead[])].sort(
          (a, b) => priorityRank(a.state) - priorityRank(b.state),
        );
        setLeads(sorted);
      })
      .catch(() => {});

    assignableApi.run(tenantId, authToken).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  const handleUpdated = (updatedLead: Lead): void => {
    setLeads((prev) => prev.map((lead) => (lead.id === updatedLead.id ? updatedLead : lead)));
  };

  const assignableUsers = assignableApi.data?.users ?? [];

  return (
    <div>
      <h1>Llamar hoy</h1>

      {leadsApi.loading && <Spinner text="Cargando cola de llamados..." />}

      {!leadsApi.loading && leadsApi.error && <ErrorBanner message={errorMessage(leadsApi.error)} />}

      {!leadsApi.loading && !leadsApi.error && leads.length === 0 && (
        <p data-testid="call-queue-empty">No hay leads pendientes de llamar.</p>
      )}

      {!leadsApi.loading && !leadsApi.error && leads.length > 0 && (
        <div data-testid="call-queue-list">
          {leads.map((lead) => (
            <CallQueueRow
              key={lead.id}
              lead={lead}
              assignableUsers={assignableUsers}
              tenantId={tenantId}
              token={authToken}
              onUpdated={handleUpdated}
            />
          ))}
        </div>
      )}
    </div>
  );
}
