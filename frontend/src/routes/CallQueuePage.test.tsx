import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CallQueuePage } from './CallQueuePage';
import { AuthProvider } from '../auth/AuthContext';
import { clearSession, setSession } from '../auth/session-store';
import { onUnauthorized } from '../api/http-client';
import * as endpoints from '../api/endpoints';
import type { Lead } from '../api/endpoints';

function renderCallQueuePage(): void {
  render(
    <MemoryRouter>
      <AuthProvider>
        <CallQueuePage />
      </AuthProvider>
    </MemoryRouter>,
  );
}

function buildLead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: 'lead-1',
    tenantId: 'tenant-1',
    phone: '+5491111111',
    name: 'Juan Pérez',
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
    turnCount: 0,
    contactedAt: null,
    assignedUserId: null,
    nextActionAt: null,
    createdAt: '2026-07-24T00:00:00.000Z',
    updatedAt: '2026-07-24T00:00:00.000Z',
    ...overrides,
  };
}

describe('CallQueuePage', () => {
  beforeEach(() => {
    clearSession();
    onUnauthorized(() => {});
    setSession({ token: 't1', role: 'OWNER', tenantId: 'tenant-1', email: 'owner@a.com' });
    vi.spyOn(endpoints, 'listAssignableUsers').mockResolvedValue({ users: [] });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    clearSession();
  });

  it('carga inicial llama listLeads filtrado por HUMAN_HANDOFF y QUALIFICATION', async () => {
    vi.spyOn(endpoints, 'listLeads').mockResolvedValue({
      leads: [buildLead()],
      total: 1,
      page: 1,
      pageSize: 20,
    });

    renderCallQueuePage();

    await waitFor(() =>
      expect(endpoints.listLeads).toHaveBeenCalledWith(
        'tenant-1',
        { state: ['HUMAN_HANDOFF', 'QUALIFICATION'] },
        't1',
      ),
    );
  });

  it('ordena HUMAN_HANDOFF antes que QUALIFICATION', async () => {
    vi.spyOn(endpoints, 'listLeads').mockResolvedValue({
      leads: [
        buildLead({ id: 'lead-q', name: 'Tibio', state: 'QUALIFICATION' }),
        buildLead({ id: 'lead-h', name: 'Caliente', state: 'HUMAN_HANDOFF' }),
      ],
      total: 2,
      page: 1,
      pageSize: 20,
    });

    renderCallQueuePage();

    const names = await screen.findAllByTestId('call-queue-row-name');
    expect(names[0]).toHaveTextContent('Caliente');
    expect(names[1]).toHaveTextContent('Tibio');
  });

  it('muestra Spinner mientras loading', async () => {
    let resolvePromise: (value: endpoints.ListLeadsResponse) => void = () => {};
    vi.spyOn(endpoints, 'listLeads').mockReturnValue(
      new Promise((resolve) => {
        resolvePromise = resolve;
      }),
    );

    renderCallQueuePage();

    expect(await screen.findByTestId('spinner')).toBeInTheDocument();

    resolvePromise({ leads: [], total: 0, page: 1, pageSize: 20 });
    await waitFor(() => expect(screen.queryByTestId('spinner')).not.toBeInTheDocument());
  });

  it('muestra ErrorBanner si falla la carga', async () => {
    vi.spyOn(endpoints, 'listLeads').mockRejectedValue(new Error('Error de red.'));

    renderCallQueuePage();

    expect(await screen.findByTestId('error-banner')).toHaveTextContent('Error de red.');
  });

  it('lista vacía muestra el mensaje fijo, no un error', async () => {
    vi.spyOn(endpoints, 'listLeads').mockResolvedValue({ leads: [], total: 0, page: 1, pageSize: 20 });

    renderCallQueuePage();

    expect(await screen.findByTestId('call-queue-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('error-banner')).not.toBeInTheDocument();
  });

  it('expandir una fila muestra ContactedToggle, AssignmentControl y NoteForm', async () => {
    vi.spyOn(endpoints, 'listLeads').mockResolvedValue({
      leads: [buildLead()],
      total: 1,
      page: 1,
      pageSize: 20,
    });

    renderCallQueuePage();

    const user = userEvent.setup();
    await user.click(await screen.findByTestId('call-queue-row-toggle'));

    expect(screen.getByTestId('contacted-toggle')).toBeInTheDocument();
    expect(screen.getByTestId('assignment-control')).toBeInTheDocument();
    expect(screen.getByTestId('note-form')).toBeInTheDocument();
  });

  it('marcar contactado actualiza la fila sin refetch de la lista', async () => {
    const lead = buildLead();
    vi.spyOn(endpoints, 'listLeads').mockResolvedValue({ leads: [lead], total: 1, page: 1, pageSize: 20 });
    vi.spyOn(endpoints, 'markContacted').mockResolvedValue({ ...lead, contactedAt: '2026-07-24T10:00:00.000Z' });

    renderCallQueuePage();

    const user = userEvent.setup();
    await user.click(await screen.findByTestId('call-queue-row-toggle'));
    await user.click(screen.getByTestId('contacted-toggle-btn'));

    await waitFor(() =>
      expect(screen.getByTestId('contacted-toggle-btn')).toHaveTextContent('Marcar como no contactado'),
    );
    expect(endpoints.listLeads).toHaveBeenCalledTimes(1);
  });
});
