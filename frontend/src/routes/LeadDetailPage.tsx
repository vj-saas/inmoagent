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
import { Card, CardBody, CardHeader } from '../components/ui';
import { MessageTimeline } from '../components/leads/MessageTimeline';
import { LeadNotes } from '../components/leads/LeadNotes';
import { NoteForm } from '../components/leads/NoteForm';
import { ContactedToggle } from '../components/leads/ContactedToggle';
import { AssignmentControl } from '../components/leads/AssignmentControl';
import { ReleaseHandoffButton } from '../components/leads/ReleaseHandoffButton';
import { OptOutButton } from '../components/leads/OptOutButton';
import { SuppressLeadButton } from '../components/leads/SuppressLeadButton';
import { LeadModeBadge, resolveLeadMode, type LeadMode } from '../components/leads/LeadModeBadge';
import { ManualReplyBox } from '../components/leads/ManualReplyBox';

function errorMessage(err: Error): string {
  return err.message || 'Ocurrió un error inesperado.';
}

/**
 * Color de fondo del header de la card de mensajes, derivado del mismo
 * `resolveLeadMode` que usa `LeadModeBadge` (AC-15, AC-20: mismo criterio en
 * toda la ficha).
 */
const MODE_HEADER_CLASSES: Record<LeadMode, string> = {
  MANUAL: 'bg-warning/10',
  OPTED_OUT: 'bg-danger/10',
  AI: 'bg-success/10',
};

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

  const fetchMessages = (): void => {
    messagesApi.run(tenantId, leadId ?? '', authToken).catch(() => {});
  };

  /** Refetch tras un envío manual exitoso (AC-16): el header cambia de color. */
  const handleManualReplySent = (): void => {
    fetchLead();
    fetchMessages();
  };

  useEffect(() => {
    if (!tenantId || !leadId) return;

    fetchLead();

    fetchMessages();

    notesApi
      .run(tenantId, leadId, authToken)
      .then((result) => setNotes(result.notes))
      .catch(() => {});

    assignableApi.run(tenantId, authToken).catch(() => {});
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
    <div className="mx-auto flex max-w-4xl flex-col gap-4 p-4">
      <h1 className="text-xl font-semibold text-text">Ficha del lead</h1>

      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold text-text">Datos del lead</h2>
        </CardHeader>
        <CardBody className="flex flex-col gap-1 text-sm text-text">
          <p>Teléfono: {lead.phone}</p>
          <p>Nombre: {lead.name ?? 'Sin nombre'}</p>
          <p>Estado: {lead.state}</p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold text-text">Acciones</h2>
        </CardHeader>
        <CardBody className="flex flex-wrap gap-2">
          <ContactedToggle lead={lead} tenantId={tenantId} token={authToken} onUpdated={setLead} />
          <ReleaseHandoffButton lead={lead} tenantId={tenantId} token={authToken} onReleased={fetchLead} />
          <OptOutButton lead={lead} tenantId={tenantId} token={authToken} onUpdated={setLead} />
          <SuppressLeadButton tenantId={tenantId} leadId={lead.id} token={authToken} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold text-text">Asignación</h2>
        </CardHeader>
        <CardBody>
          {assignableApi.error && (
            <div data-testid="assignable-users-error" role="alert" className="mb-2 text-sm text-danger">
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
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          data-testid="messages-card-header"
          className={`flex items-center justify-between ${MODE_HEADER_CLASSES[resolveLeadMode(lead.state)]}`}
        >
          <h2 className="text-base font-semibold text-text">Mensajes</h2>
          <LeadModeBadge state={lead.state} />
        </CardHeader>
        <CardBody className="flex flex-col gap-4">
          <MessageTimeline messages={messages} />
          <ManualReplyBox
            lead={lead}
            tenantId={tenantId}
            token={authToken}
            onSent={handleManualReplySent}
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold text-text">Notas internas</h2>
        </CardHeader>
        <CardBody>
          {notesApi.error && (
            <div data-testid="notes-error" role="alert" className="mb-2 text-sm text-danger">
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
        </CardBody>
      </Card>
    </div>
  );
}
