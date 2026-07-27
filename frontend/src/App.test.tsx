import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppRoutes } from './App';
import { AuthProvider } from './auth/AuthContext';
import { clearSession, setSession } from './auth/session-store';
import * as endpoints from './api/endpoints';
import type { Lead, MetricsResult } from './api/endpoints';

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

  it('con sesion, / redirige a /dashboard', () => {
    setSession({
      token: 'token-123',
      role: 'OWNER',
      tenantId: 'tenant-1',
      email: 'owner@test.com',
    });

    renderApp('/');

    expect(screen.getByRole('heading', { name: /panel de control/i })).toBeInTheDocument();
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
      expect(screen.getByRole('heading', { name: /lead de prueba/i })).toBeInTheDocument();
    });
    expect(screen.getByText(/5491100000000/)).toBeInTheDocument();
  });

  it('con sesion, navegar a /dashboard renderiza DashboardPage', async () => {
    setSession({
      token: 'token-123',
      role: 'OWNER',
      tenantId: 'tenant-1',
      email: 'owner@test.com',
    });

    const mockMetrics: MetricsResult = {
      range: { from: '2026-06-24', to: '2026-07-24' },
      newLeads: 5,
      activeConversations: 3,
      handoffs: 1,
      appointments: { proposed: 2, confirmed: 1 },
    };

    vi.spyOn(endpoints, 'getMetrics').mockResolvedValue(mockMetrics);

    renderApp('/dashboard');

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /panel/i })).toBeInTheDocument();
    });
  });

  // AC-1 / AC-18 (spec B.2): /agenda debe estar registrada bajo ProtectedRoute
  // y renderizar AgendaPage.
  it('con sesion, navegar a /agenda renderiza AgendaPage', async () => {
    setSession({
      token: 'token-123',
      role: 'OWNER',
      tenantId: 'tenant-1',
      email: 'owner@test.com',
    });

    vi.spyOn(endpoints, 'listAppointments').mockResolvedValue({ appointments: [] });

    renderApp('/agenda');

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /agenda/i })).toBeInTheDocument();
    });
  });

  // T18: /configuracion vive bajo ProtectedRoute -> sin sesion redirige a
  // /login, igual que el resto de las rutas protegidas.
  it('sin sesion, /configuracion redirige a /login', () => {
    renderApp('/configuracion');

    expect(screen.getByRole('heading', { name: /iniciar sesión/i })).toBeInTheDocument();
  });

  it('con sesion OWNER, navegar a /configuracion renderiza TenantConfigPage', async () => {
    setSession({
      token: 'token-123',
      role: 'OWNER',
      tenantId: 'tenant-1',
      email: 'owner@test.com',
    });

    vi.spyOn(endpoints, 'getWebhookStatus').mockResolvedValue({
      connected: false,
      lastEventAt: null,
      lastMessageAt: null,
    });

    renderApp('/configuracion');

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'Configuración' })).toBeInTheDocument();
    });
  });

  // T18: /onboarding es publica (fuera de ProtectedRoute) porque corre antes
  // de que exista ninguna sesion de persona.
  it('sin sesion, /onboarding renderiza OnboardingWizardPage (no redirige a /login)', () => {
    renderApp('/onboarding');

    expect(screen.getByRole('heading', { name: /alta de inmobiliaria/i })).toBeInTheDocument();
  });
});
