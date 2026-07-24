import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LeadDetailPage } from './LeadDetailPage';
import * as endpoints from '../api/endpoints';
import * as authContext from '../auth/AuthContext';
import type { AuthContextValue } from '../auth/AuthContext';
import type { Lead } from '../api/endpoints';

const TENANT_ID = 'tenant-1';
const LEAD_ID = 'lead-123';
const TOKEN = 'token-abc';

function buildLead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: LEAD_ID,
    tenantId: TENANT_ID,
    phone: '5491100000000',
    name: 'Juana Pérez',
    state: 'QUALIFICATION',
    fOperation: null,
    fNeighborhoods: [],
    fMaxPrice: null,
    fCurrency: null,
    fMinRooms: null,
    fGarage: null,
    fPetsAllowed: null,
    fNotes: null,
    fPreferredDay: null,
    fOfferedNeighborhoods: [],
    fPriceMentionedAtTurn: null,
    handoffAt: null,
    optedOutAt: null,
    lastMessageAt: null,
    greetedAt: null,
    lastSearchIds: [],
    turnCount: 1,
    contactedAt: null,
    assignedUserId: null,
    nextActionAt: null,
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    ...overrides,
  };
}

function mockAuth(): void {
  vi.spyOn(authContext, 'useAuth').mockReturnValue({
    isAuthenticated: true,
    person: { role: 'OWNER', tenantId: TENANT_ID, email: 'a@a.com' },
    token: TOKEN,
    login: vi.fn(),
    logout: vi.fn(),
  } as AuthContextValue);
}

function renderPage(): void {
  render(
    <MemoryRouter initialEntries={[`/leads/${LEAD_ID}`]}>
      <Routes>
        <Route path="/leads/:leadId" element={<LeadDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('LeadDetailPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockAuth();
  });

  it('AC-1: dispara los 4 endpoints en paralelo con tenantId/leadId/token correctos', async () => {
    const getLeadSpy = vi.spyOn(endpoints, 'getLead').mockResolvedValue(buildLead());
    const getLeadMessagesSpy = vi
      .spyOn(endpoints, 'getLeadMessages')
      .mockResolvedValue({ lead: buildLead(), messages: [] });
    const getLeadNotesSpy = vi.spyOn(endpoints, 'getLeadNotes').mockResolvedValue({ notes: [] });
    const listAssignableUsersSpy = vi
      .spyOn(endpoints, 'listAssignableUsers')
      .mockResolvedValue({ users: [] });

    renderPage();

    await waitFor(() => {
      expect(getLeadSpy).toHaveBeenCalledWith(TENANT_ID, LEAD_ID, TOKEN);
    });
    expect(getLeadMessagesSpy).toHaveBeenCalledWith(TENANT_ID, LEAD_ID, TOKEN);
    expect(getLeadNotesSpy).toHaveBeenCalledWith(TENANT_ID, LEAD_ID, TOKEN);
    expect(listAssignableUsersSpy).toHaveBeenCalledWith(TENANT_ID, TOKEN);
  });

  it('AC-2: muestra Spinner mientras lead/messages están en curso', async () => {
    vi.spyOn(endpoints, 'getLead').mockReturnValue(new Promise(() => {}));
    vi.spyOn(endpoints, 'getLeadMessages').mockReturnValue(new Promise(() => {}));
    vi.spyOn(endpoints, 'getLeadNotes').mockResolvedValue({ notes: [] });
    vi.spyOn(endpoints, 'listAssignableUsers').mockResolvedValue({ users: [] });

    renderPage();

    expect(screen.getByTestId('spinner')).toBeInTheDocument();
  });

  it('AC-3: muestra ErrorBanner si getLead falla, sin renderizar la ficha', async () => {
    vi.spyOn(endpoints, 'getLead').mockRejectedValue(new Error('No se pudo cargar el lead'));
    vi.spyOn(endpoints, 'getLeadMessages').mockResolvedValue({ lead: buildLead(), messages: [] });
    vi.spyOn(endpoints, 'getLeadNotes').mockResolvedValue({ notes: [] });
    vi.spyOn(endpoints, 'listAssignableUsers').mockResolvedValue({ users: [] });

    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('error-banner')).toBeInTheDocument();
    });
    expect(screen.queryByText('Datos del lead')).not.toBeInTheDocument();
  });

  it('AC-3: muestra ErrorBanner si getLeadMessages falla, sin renderizar la ficha', async () => {
    vi.spyOn(endpoints, 'getLead').mockResolvedValue(buildLead());
    vi.spyOn(endpoints, 'getLeadMessages').mockRejectedValue(new Error('No se pudieron cargar los mensajes'));
    vi.spyOn(endpoints, 'getLeadNotes').mockResolvedValue({ notes: [] });
    vi.spyOn(endpoints, 'listAssignableUsers').mockResolvedValue({ users: [] });

    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('error-banner')).toBeInTheDocument();
    });
    expect(screen.queryByText('Datos del lead')).not.toBeInTheDocument();
  });

  it('notas/assignable-users: un error secundario no bloquea el resto de la ficha', async () => {
    vi.spyOn(endpoints, 'getLead').mockResolvedValue(buildLead());
    vi.spyOn(endpoints, 'getLeadMessages').mockResolvedValue({ lead: buildLead(), messages: [] });
    vi.spyOn(endpoints, 'getLeadNotes').mockRejectedValue(new Error('falló notas'));
    vi.spyOn(endpoints, 'listAssignableUsers').mockRejectedValue(new Error('falló assignable'));

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Datos del lead')).toBeInTheDocument();
    });
    expect(screen.getByTestId('notes-error')).toBeInTheDocument();
    expect(screen.getByTestId('assignable-users-error')).toBeInTheDocument();
    // No hay ErrorBanner global bloqueando la pantalla.
    expect(screen.queryByTestId('error-banner')).not.toBeInTheDocument();
  });

  it('integración: agregar una nota real desde el form la refleja en la lista sin recargar (AC-5/AC-7)', async () => {
    const user = userEvent.setup();
    vi.spyOn(endpoints, 'getLead').mockResolvedValue(buildLead());
    vi.spyOn(endpoints, 'getLeadMessages').mockResolvedValue({ lead: buildLead(), messages: [] });
    vi.spyOn(endpoints, 'getLeadNotes').mockResolvedValue({ notes: [] });
    vi.spyOn(endpoints, 'listAssignableUsers').mockResolvedValue({ users: [] });
    vi.spyOn(endpoints, 'createNote').mockResolvedValue({
      id: 'note-1',
      leadId: LEAD_ID,
      tenantId: TENANT_ID,
      body: 'Habló por teléfono, pidió más fotos',
      createdAt: '2026-07-01T12:00:00.000Z',
      author: { id: 'person-1', email: 'a@a.com' },
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Datos del lead')).toBeInTheDocument();
    });

    await user.type(screen.getByTestId('note-form-textarea'), 'Habló por teléfono, pidió más fotos');
    await user.click(screen.getByTestId('note-form-submit'));

    await waitFor(() => {
      expect(screen.getByTestId('lead-note-note-1')).toBeInTheDocument();
    });
    expect(screen.getByTestId('lead-note-body-note-1')).toHaveTextContent(
      'Habló por teléfono, pidió más fotos',
    );
  });

  it('integración: marcar contactado actualiza el botón en pantalla sin recargar (AC-9/AC-11)', async () => {
    const user = userEvent.setup();
    vi.spyOn(endpoints, 'getLead').mockResolvedValue(buildLead({ contactedAt: null }));
    vi.spyOn(endpoints, 'getLeadMessages').mockResolvedValue({ lead: buildLead(), messages: [] });
    vi.spyOn(endpoints, 'getLeadNotes').mockResolvedValue({ notes: [] });
    vi.spyOn(endpoints, 'listAssignableUsers').mockResolvedValue({ users: [] });
    vi.spyOn(endpoints, 'markContacted').mockResolvedValue(
      buildLead({ contactedAt: '2026-07-01T12:00:00.000Z' }),
    );

    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('contacted-toggle-btn')).toHaveTextContent('Marcar como contactado');
    });

    await user.click(screen.getByTestId('contacted-toggle-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('contacted-toggle-btn')).toHaveTextContent('Marcar como no contactado');
    });
  });

  it('integración: liberar handoff dispara el refetch y oculta el botón cuando el estado ya cambió (AC-15)', async () => {
    const user = userEvent.setup();
    const getLeadSpy = vi
      .spyOn(endpoints, 'getLead')
      .mockResolvedValueOnce(buildLead({ state: 'HUMAN_HANDOFF' }))
      .mockResolvedValueOnce(buildLead({ state: 'QUALIFICATION' }));
    vi.spyOn(endpoints, 'getLeadMessages').mockResolvedValue({ lead: buildLead(), messages: [] });
    vi.spyOn(endpoints, 'getLeadNotes').mockResolvedValue({ notes: [] });
    vi.spyOn(endpoints, 'listAssignableUsers').mockResolvedValue({ users: [] });
    vi.spyOn(endpoints, 'releaseLead').mockResolvedValue({ released: true });

    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('release-handoff-button')).toBeInTheDocument();
    });

    await user.click(screen.getByTestId('release-handoff-button'));

    await waitFor(() => {
      expect(screen.queryByTestId('release-handoff-button')).not.toBeInTheDocument();
    });
    expect(getLeadSpy).toHaveBeenCalledTimes(2);
  });
});
