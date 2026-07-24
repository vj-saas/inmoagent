import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LeadsPage } from './LeadsPage';
import { AuthProvider } from '../auth/AuthContext';
import { clearSession, setSession } from '../auth/session-store';
import { onUnauthorized } from '../api/http-client';
import * as endpoints from '../api/endpoints';
import type { Lead } from '../api/endpoints';

function renderLeadsPage(): void {
  render(
    <MemoryRouter>
      <AuthProvider>
        <LeadsPage />
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
    state: 'GREETING',
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
    createdAt: '2026-07-24T00:00:00.000Z',
    updatedAt: '2026-07-24T00:00:00.000Z',
    ...overrides,
  };
}

describe('LeadsPage', () => {
  beforeEach(() => {
    clearSession();
    onUnauthorized(() => {});
    setSession({ token: 't1', role: 'OWNER', tenantId: 'tenant-1', email: 'owner@a.com' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    clearSession();
  });

  it('carga inicial llama listLeads con el tenantId correcto', async () => {
    vi.spyOn(endpoints, 'listLeads').mockResolvedValue({
      leads: [buildLead()],
      total: 1,
      page: 1,
      pageSize: 20,
    });

    renderLeadsPage();

    await waitFor(() =>
      expect(endpoints.listLeads).toHaveBeenCalledWith(
        'tenant-1',
        expect.objectContaining({ page: 1 }),
        't1',
      ),
    );
  });

  it('cambiar el filtro de estado resetea a page 1 y reinvoca listLeads', async () => {
    vi.spyOn(endpoints, 'listLeads').mockResolvedValue({
      leads: [buildLead()],
      total: 1,
      page: 1,
      pageSize: 20,
    });

    renderLeadsPage();
    await waitFor(() => expect(endpoints.listLeads).toHaveBeenCalledTimes(1));

    const user = userEvent.setup();
    const select = screen.getByTestId('lead-state-filter');
    await user.selectOptions(select, 'En búsqueda');

    await waitFor(() =>
      expect(endpoints.listLeads).toHaveBeenLastCalledWith(
        'tenant-1',
        expect.objectContaining({ state: ['SEARCH_MATCH'], page: 1 }),
        't1',
      ),
    );
  });

  it('cambiar la búsqueda resetea a page 1 y reinvoca listLeads', async () => {
    vi.spyOn(endpoints, 'listLeads').mockResolvedValue({
      leads: [buildLead()],
      total: 1,
      page: 1,
      pageSize: 20,
    });

    renderLeadsPage();
    await waitFor(() => expect(endpoints.listLeads).toHaveBeenCalledTimes(1));

    const user = userEvent.setup();
    await user.type(screen.getByTestId('lead-search-input'), 'juan');

    await waitFor(
      () =>
        expect(endpoints.listLeads).toHaveBeenLastCalledWith(
          'tenant-1',
          expect.objectContaining({ q: 'juan', page: 1 }),
          't1',
        ),
      { timeout: 2000 },
    );
  });

  it('muestra Spinner mientras loading', async () => {
    let resolvePromise: (value: endpoints.ListLeadsResponse) => void = () => {};
    vi.spyOn(endpoints, 'listLeads').mockReturnValue(
      new Promise((resolve) => {
        resolvePromise = resolve;
      }),
    );

    renderLeadsPage();

    expect(await screen.findByTestId('spinner')).toBeInTheDocument();

    resolvePromise({ leads: [], total: 0, page: 1, pageSize: 20 });
    await waitFor(() => expect(screen.queryByTestId('spinner')).not.toBeInTheDocument());
  });

  it('muestra ErrorBanner si falla la carga', async () => {
    vi.spyOn(endpoints, 'listLeads').mockRejectedValue(new Error('Error de red.'));

    renderLeadsPage();

    expect(await screen.findByTestId('error-banner')).toHaveTextContent('Error de red.');
    expect(screen.queryByTestId('leads-list')).not.toBeInTheDocument();
  });

  it('lista vacía muestra el mensaje fijo, no un error', async () => {
    vi.spyOn(endpoints, 'listLeads').mockResolvedValue({
      leads: [],
      total: 0,
      page: 1,
      pageSize: 20,
    });

    renderLeadsPage();

    expect(await screen.findByText('No hay leads para este filtro')).toBeInTheDocument();
    expect(screen.queryByTestId('error-banner')).not.toBeInTheDocument();
  });

  it('con datos, muestra la lista y la paginación sin spinner/error/mensaje vacío (estados mutuamente excluyentes)', async () => {
    vi.spyOn(endpoints, 'listLeads').mockResolvedValue({
      leads: [buildLead()],
      total: 1,
      page: 1,
      pageSize: 20,
    });

    renderLeadsPage();

    expect(await screen.findByTestId('leads-list')).toBeInTheDocument();
    expect(screen.getByTestId('pagination')).toBeInTheDocument();
    expect(screen.queryByTestId('spinner')).not.toBeInTheDocument();
    expect(screen.queryByTestId('error-banner')).not.toBeInTheDocument();
    expect(screen.queryByText('No hay leads para este filtro')).not.toBeInTheDocument();
  });

  it('cambiar de página NO resetea page a 1 y preserva el filtro/búsqueda vigentes', async () => {
    vi.spyOn(endpoints, 'listLeads').mockResolvedValue({
      leads: [buildLead()],
      total: 100,
      page: 1,
      pageSize: 20,
    });

    renderLeadsPage();
    await waitFor(() => expect(endpoints.listLeads).toHaveBeenCalledTimes(1));

    const user = userEvent.setup();
    await user.selectOptions(screen.getByTestId('lead-state-filter'), 'Agendó visita');
    await waitFor(() =>
      expect(endpoints.listLeads).toHaveBeenLastCalledWith(
        'tenant-1',
        expect.objectContaining({ state: ['SCHEDULING'], page: 1 }),
        't1',
      ),
    );

    await user.click(screen.getByTestId('pagination-next-btn'));

    await waitFor(() =>
      expect(endpoints.listLeads).toHaveBeenLastCalledWith(
        'tenant-1',
        expect.objectContaining({ state: ['SCHEDULING'], page: 2 }),
        't1',
      ),
    );
  });
});
