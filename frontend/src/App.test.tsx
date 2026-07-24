import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppRoutes } from './App';
import { AuthProvider } from './auth/AuthContext';
import { clearSession, setSession } from './auth/session-store';
import * as endpoints from './api/endpoints';
import type { Lead } from './api/endpoints';

function buildLead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: 'lead-42',
    tenantId: 'tenant-1',
    phone: '5491100000000',
    name: 'Lead de prueba',
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

function renderApp(initialEntry: string): void {
  render(
    <AuthProvider>
      <MemoryRouter initialEntries={[initialEntry]}>
        <AppRoutes />
      </MemoryRouter>
    </AuthProvider>,
  );
}

describe('AppRoutes', () => {
  beforeEach(() => {
    clearSession();
  });

  it('sin sesion, una ruta protegida redirige a /login', () => {
    renderApp('/leads');

    expect(screen.getByRole('heading', { name: /iniciar sesión/i })).toBeInTheDocument();
  });

  it('sin sesion, /leads/:leadId tambien redirige a /login', () => {
    renderApp('/leads/lead-1');

    expect(screen.getByRole('heading', { name: /iniciar sesión/i })).toBeInTheDocument();
  });

  it('con sesion, / redirige a /leads', () => {
    setSession({
      token: 'token-123',
      role: 'OWNER',
      tenantId: 'tenant-1',
      email: 'owner@test.com',
    });

    renderApp('/');

    expect(screen.getByRole('heading', { name: /bandeja de leads/i })).toBeInTheDocument();
  });

  it('con sesion, navegar a /leads/:leadId renderiza LeadDetailPage con el id correcto', async () => {
    setSession({
      token: 'token-123',
      role: 'OWNER',
      tenantId: 'tenant-1',
      email: 'owner@test.com',
    });

    vi.spyOn(endpoints, 'getLead').mockResolvedValue(buildLead());
    vi.spyOn(endpoints, 'getLeadMessages').mockResolvedValue({ lead: buildLead(), messages: [] });
    vi.spyOn(endpoints, 'getLeadNotes').mockResolvedValue({ notes: [] });
    vi.spyOn(endpoints, 'listAssignableUsers').mockResolvedValue({ users: [] });

    renderApp('/leads/lead-42');

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /ficha del lead/i })).toBeInTheDocument();
    });
    expect(screen.getByText(/5491100000000/)).toBeInTheDocument();
  });
});
