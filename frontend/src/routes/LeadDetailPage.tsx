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
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
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
import { Slab, SlabBody, SlabHead, Meta } from '../components/ui';
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
    <div className="space-y-8">
      {/*
        Cabecera de ficha: "Volver" en mono (reemplaza al breadcrumb, ver IA),
        el nombre a tamaño de titular y el teléfono como dato tabular debajo.
      */}
      <header className="border-b-2 border-border-strong pb-4">
        <Link to="/leads" className="u-wipe group relative inline-flex items-center gap-1.5">
          <ArrowLeft className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
          <Meta muted={false} className="text-text-muted">
            Volver
          </Meta>
          <span
            aria-hidden="true"
            className="u-wipe-line origin-left scale-x-0 transition-transform duration-200 ease-out group-hover:scale-x-100"
          />
        </Link>

        <h1 className="u-display mt-3 text-[clamp(1.75rem,4.5vw,3rem)] text-text">
          {lead.name || lead.phone}
        </h1>
        <p className="u-num mt-1 font-mono text-sm text-text-muted">{lead.phone}</p>
      </header>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        {/* Columna izquierda: la transcripción es la razón de estar acá. */}
        <div className="space-y-6 lg:col-span-2">
          <Slab rule="ink">
            {/*
              El fondo del encabezado codifica quién está respondiendo
              (`MODE_HEADER_CLASSES`, mismo criterio que `LeadModeBadge`):
              es contrato con LeadDetailPage.test.tsx, no decoración.
            */}
            <SlabHead
              data-testid="messages-card-header"
              className={`${MODE_HEADER_CLASSES[resolveLeadMode(lead.state)]} px-5 py-4`}
            >
              <h2 className="u-display text-base text-text">Mensajes</h2>
              <LeadModeBadge state={lead.state} />
            </SlabHead>
            <SlabBody className="flex flex-col gap-4 p-5">
              <MessageTimeline messages={messages} />
              <ManualReplyBox
                lead={lead}
                tenantId={tenantId}
                token={authToken}
                onSent={handleManualReplySent}
              />
            </SlabBody>
          </Slab>
        </div>

        {/* Columna derecha: contexto y acciones, sin competir con el timeline. */}
        <div className="space-y-6 lg:col-span-1">
          <Slab rule="hairline">
            <SlabHead>
              <h2 className="u-meta text-text">Datos del lead</h2>
            </SlabHead>
            <SlabBody className="divide-y divide-border p-0">
              {/*
                El teléfono no se repite acá: ya está en la cabecera, debajo
                del nombre, que es donde se lo busca para llamar.
              */}
              {[
                { label: 'Nombre', value: lead.name ?? 'Sin nombre', mono: false },
                { label: 'Estado', value: lead.state, mono: true },
                {
                  label: 'Turnos',
                  value: String(lead.turnCount ?? 0),
                  mono: true,
                },
              ].map((field) => (
                <div
                  key={field.label}
                  className="flex items-baseline justify-between gap-4 px-4 py-3"
                >
                  <Meta>{field.label}</Meta>
                  <span
                    className={
                      field.mono
                        ? 'u-num font-mono text-sm text-text'
                        : 'text-sm font-semibold text-text'
                    }
                  >
                    {field.value}
                  </span>
                </div>
              ))}
            </SlabBody>
          </Slab>

          {/*
            Acciones en dos bloques con jerarquía explícita (handoff §4.5):
            rutina arriba, y una zona de riesgo delimitada abajo para que
            dar de baja o suprimir un lead no se confunda con marcarlo
            contactado.
          */}
          <Slab rule="hairline">
            <SlabHead>
              <h2 className="u-meta text-text">Acciones</h2>
            </SlabHead>
            <SlabBody className="flex flex-col gap-2 p-4">
              <ContactedToggle
                lead={lead}
                tenantId={tenantId}
                token={authToken}
                onUpdated={setLead}
              />
              <ReleaseHandoffButton
                lead={lead}
                tenantId={tenantId}
                token={authToken}
                onReleased={fetchLead}
              />
            </SlabBody>
            <div className="border-t-2 border-danger/50 bg-danger/5 p-4">
              <Meta as="div" className="mb-2 text-danger">
                Zona de riesgo
              </Meta>
              <div className="flex flex-col gap-2">
                <OptOutButton
                  lead={lead}
                  tenantId={tenantId}
                  token={authToken}
                  onUpdated={setLead}
                />
                <SuppressLeadButton tenantId={tenantId} leadId={lead.id} token={authToken} />
              </div>
            </div>
          </Slab>

          <Slab rule="hairline">
            <SlabHead>
              <h2 className="u-meta text-text">Asignación</h2>
            </SlabHead>
            <SlabBody className="p-4">
              {assignableApi.error && (
                <div
                  data-testid="assignable-users-error"
                  role="alert"
                  className="mb-2 text-sm text-danger"
                >
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
            </SlabBody>
          </Slab>

          <Slab rule="hairline">
            <SlabHead>
              <h2 className="u-meta text-text">Notas internas</h2>
            </SlabHead>
            <SlabBody className="space-y-4 p-4">
              {notesApi.error && (
                <div data-testid="notes-error" role="alert" className="mb-2 text-sm text-danger">
                  No se pudieron cargar las notas.
                </div>
              )}
              <LeadNotes notes={notes} />
              <div className="border-t border-border pt-4">
                <NoteForm
                  tenantId={tenantId}
                  leadId={lead.id}
                  token={authToken}
                  onCreated={(note) => setNotes((prev) => [note, ...prev])}
                />
              </div>
            </SlabBody>
          </Slab>
        </div>
      </div>
    </div>
  );
}
