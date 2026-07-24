/**
 * Ficha de detalle de un lead (orquestador).
 *
 * - Lee `leadId` de la URL con `useParams()` y `tenantId`/`token` de
 *   `AuthContext` (nunca hardcodeado).
 * - Al montar, dispara EN PARALELO `getLead`, `getLeadMessages`,
 *   `getLeadNotes` y `listAssignableUsers`, cada uno con su propio `useApi`.
 * - `lead`/`messages` son críticos: mientras están en curso se muestra
 *   `Spinner`; si cualquiera de los dos falla, se muestra `ErrorBanner` sin
 *   renderizar una ficha vacía.
 * - `notes`/`assignableUsers` son secundarios: si fallan, la ficha se muestra
 *   igual con un aviso local en su sección, sin bloquear el resto.
 * - Mantiene `lead` y `notes` en estado local propio (no solo en el `data`
 *   de `useApi`) para permitir que los componentes hijos de escritura los
 *   actualicen sin refetch (`setLead`, `setNotes`).
 */

import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  getLead,
  getLeadMessages,
  getLeadNotes,
  listAssignableUsers,
  type AssignableUser,
  type Lead,
  type LeadNote,
  type Message,
} from '../api/endpoints';
import { useAuth } from '../auth/AuthContext';
import { useApi } from '../hooks/useApi';
import { Spinner } from '../components/Spinner';
import { ErrorBanner } from '../components/ErrorBanner';
import { MessageTimeline } from '../components/leads/MessageTimeline';
import { LeadNotes } from '../components/leads/LeadNotes';
import { NoteForm } from '../components/leads/NoteForm';
import { ContactedToggle } from '../components/leads/ContactedToggle';
import { AssignmentControl } from '../components/leads/AssignmentControl';
import { ReleaseHandoffButton } from '../components/leads/ReleaseHandoffButton';
import { OptOutButton } from '../components/leads/OptOutButton';
import { SuppressLeadButton } from '../components/leads/SuppressLeadButton';

function errorMessage(err: Error): string {
  return err.message || 'Ocurrió un error inesperado.';
}

export function LeadDetailPage(): JSX.Element {
  const { leadId } = useParams<{ leadId: string }>();
  const { person, token } = useAuth();
  const tenantId = person?.tenantId ?? '';
  const authToken = token ?? '';

  const [lead, setLead] = useState<Lead | null>(null);
  const [notes, setNotes] = useState<LeadNote[]>([]);

  const leadApi = useApi<Lead>(getLead as (...args: unknown[]) => Promise<Lead>);
  const messagesApi = useApi<{ lead: Lead; messages: Message[] }>(
    getLeadMessages as (...args: unknown[]) => Promise<{ lead: Lead; messages: Message[] }>,
  );
  const notesApi = useApi<{ notes: LeadNote[] }>(
    getLeadNotes as (...args: unknown[]) => Promise<{ notes: LeadNote[] }>,
  );
  const assignableApi = useApi<{ users: AssignableUser[] }>(
    listAssignableUsers as (...args: unknown[]) => Promise<{ users: AssignableUser[] }>,
  );

  const fetchLead = (): void => {
    leadApi
      .run(tenantId, leadId ?? '', authToken)
      .then((result) => setLead(result))
      .catch(() => {});
  };

  useEffect(() => {
    if (!tenantId || !leadId) return;

    fetchLead();

    messagesApi.run(tenantId, leadId, authToken).catch(() => {});

    notesApi
      .run(tenantId, leadId, authToken)
      .then((result) => setNotes(result.notes))
      .catch(() => {});

    assignableApi.run(tenantId, leadId, authToken).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, leadId]);

  const criticalLoading = leadApi.loading || messagesApi.loading;
  const criticalError = leadApi.error || messagesApi.error;

  if (criticalLoading) {
    return <Spinner text="Cargando ficha del lead..." />;
  }

  if (criticalError) {
    return <ErrorBanner message={errorMessage(criticalError)} />;
  }

  if (!lead) {
    return <Spinner text="Cargando ficha del lead..." />;
  }

  const messages = messagesApi.data?.messages ?? [];
  const assignableUsers = assignableApi.data?.users ?? [];

  return (
    <div>
      <h1>Ficha del lead</h1>

      <section>
        <h2>Datos del lead</h2>
        <p>Teléfono: {lead.phone}</p>
        <p>Nombre: {lead.name ?? 'Sin nombre'}</p>
        <p>Estado: {lead.state}</p>
      </section>

      <section>
        <h2>Acciones</h2>
        <ContactedToggle lead={lead} tenantId={tenantId} token={authToken} onUpdated={setLead} />
        <ReleaseHandoffButton lead={lead} tenantId={tenantId} token={authToken} onReleased={fetchLead} />
        <OptOutButton lead={lead} tenantId={tenantId} token={authToken} onUpdated={setLead} />
        <SuppressLeadButton tenantId={tenantId} leadId={lead.id} token={authToken} />
      </section>

      <section>
        <h2>Asignación</h2>
        {assignableApi.error && (
          <div data-testid="assignable-users-error" role="alert">
            No se pudo cargar la lista de personas asignables.
          </div>
        )}
        <AssignmentControl
          lead={lead}
          assignableUsers={assignableUsers}
          tenantId={tenantId}
          leadId={lead.id}
          token={authToken}
          onUpdated={setLead}
        />
      </section>

      <section>
        <h2>Mensajes</h2>
        <MessageTimeline messages={messages} />
      </section>

      <section>
        <h2>Notas internas</h2>
        {notesApi.error && (
          <div data-testid="notes-error" role="alert">
            No se pudieron cargar las notas.
          </div>
        )}
        <LeadNotes notes={notes} />
        <NoteForm
          tenantId={tenantId}
          leadId={lead.id}
          token={authToken}
          onCreated={(note) => setNotes((prev) => [note, ...prev])}
        />
      </section>
    </div>
  );
}
