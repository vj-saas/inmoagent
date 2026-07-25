/**
 * Guardrail estructural de responsive (AC-8), parte del gate final de T12.
 *
 * jsdom no tiene motor de layout: no puede medir `scrollWidth`/`clientWidth`
 * reales ni detectar overflow horizontal de verdad (eso queda para el
 * checklist manual en `specs/V-B-design-system/responsive-checklist.md`).
 * Lo que SÍ se puede verificar sin layout es la causa raíz más común de ese
 * overflow: una tabla sin contenedor `overflow-x-auto`. Este test renderiza
 * las 8 rutas migradas y confirma que toda tabla (`<table>`) esté anidada
 * dentro de un contenedor con la clase `overflow-x-auto` (el `TableScroll`
 * de `components/ui/Table.tsx`).
 */
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LoginPage } from './LoginPage';
import { DashboardPage } from './DashboardPage';
import { LeadsPage } from './LeadsPage';
import { LeadDetailPage } from './LeadDetailPage';
import { AgendaPage } from './AgendaPage';
import { CallQueuePage } from './CallQueuePage';
import { PeoplePage } from './PeoplePage';
import { AppLayout } from './AppLayout';
import { AuthProvider } from '../auth/AuthContext';
import { clearSession, setSession } from '../auth/session-store';
import { onUnauthorized } from '../api/http-client';
import * as endpoints from '../api/endpoints';
import type { Lead, Appointment } from '../api/endpoints';

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
    contactedAt: null,
    assignedUserId: null,
    nextActionAt: null,
    createdAt: '2026-07-24T00:00:00.000Z',
    updatedAt: '2026-07-24T00:00:00.000Z',
    ...overrides,
  };
}

function buildAppointment(overrides: Partial<Appointment> = {}): Appointment {
  return {
    id: 'appt-1',
    tenantId: 'tenant-1',
    leadId: 'lead-1',
    status: 'PROPOSED',
    scheduledAt: null,
    notes: null,
    outcome: null,
    assignedUserId: null,
    createdAt: '2026-07-24T00:00:00.000Z',
    updatedAt: '2026-07-24T00:00:00.000Z',
    ...overrides,
  };
}

/** Toda tabla del DOM tiene que estar dentro de un contenedor overflow-x-auto. */
function expectTablesToBeScrollable(container: HTMLElement): void {
  const tables = container.querySelectorAll('table');
  tables.forEach((table) => {
    let node: HTMLElement | null = table.parentElement;
    let found = false;
    while (node) {
      if (node.className && node.className.toString().includes('overflow-x-auto')) {
        found = true;
        break;
      }
      node = node.parentElement;
    }
    expect(found).toBe(true);
  });
}

describe('responsive-guardrails: tablas siempre dentro de overflow-x-auto (AC-8)', () => {
  beforeEach(() => {
    clearSession();
    onUnauthorized(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    clearSession();
  });

  it('LoginPage', async () => {
    const { container } = render(
      <MemoryRouter>
        <AuthProvider>
          <LoginPage />
        </AuthProvider>
      </MemoryRouter>,
    );
    await screen.findByText('Iniciar sesión');
    expectTablesToBeScrollable(container);
  });

  it('DashboardPage', async () => {
    setSession({ token: 't1', role: 'OWNER', tenantId: 'tenant-1', email: 'owner@a.com' });
    vi.spyOn(endpoints, 'getMetrics').mockResolvedValue({
      range: { from: '2026-06-24T00:00:00.000Z', to: '2026-07-24T23:59:59.999Z' },
      newLeads: 10,
      activeConversations: 5,
      handoffs: 2,
      appointments: { proposed: 3, confirmed: 1 },
    });

    const { container } = render(
      <MemoryRouter>
        <AuthProvider>
          <DashboardPage />
        </AuthProvider>
      </MemoryRouter>,
    );
    await waitFor(() => expect(endpoints.getMetrics).toHaveBeenCalled());
    expectTablesToBeScrollable(container);
  });

  it('LeadsPage', async () => {
    setSession({ token: 't1', role: 'OWNER', tenantId: 'tenant-1', email: 'owner@a.com' });
    vi.spyOn(endpoints, 'listLeads').mockResolvedValue({
      leads: [buildLead()],
      total: 1,
      page: 1,
      pageSize: 20,
    });

    const { container } = render(
      <MemoryRouter>
        <AuthProvider>
          <LeadsPage />
        </AuthProvider>
      </MemoryRouter>,
    );
    expect(await screen.findByTestId('leads-list')).toBeInTheDocument();
    expectTablesToBeScrollable(container);
  });

  it('LeadDetailPage', async () => {
    setSession({ token: 't1', role: 'OWNER', tenantId: 'tenant-1', email: 'owner@a.com' });
    vi.spyOn(endpoints, 'getLead').mockResolvedValue(buildLead());
    vi.spyOn(endpoints, 'getLeadMessages').mockResolvedValue({ lead: buildLead(), messages: [] });
    vi.spyOn(endpoints, 'getLeadNotes').mockResolvedValue({ notes: [] });
    vi.spyOn(endpoints, 'listAssignableUsers').mockResolvedValue({ users: [] });

    const { container } = render(
      <MemoryRouter initialEntries={['/leads/lead-1']}>
        <AuthProvider>
          <Routes>
            <Route path="/leads/:leadId" element={<LeadDetailPage />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    );
    await waitFor(() => expect(endpoints.getLead).toHaveBeenCalled());
    expectTablesToBeScrollable(container);
  });

  it('AgendaPage', async () => {
    setSession({ token: 't1', role: 'OWNER', tenantId: 'tenant-1', email: 'owner@a.com' });
    vi.spyOn(endpoints, 'listAppointments').mockResolvedValue({
      appointments: [buildAppointment()],
    });
    vi.spyOn(endpoints, 'listAssignableUsers').mockResolvedValue({ users: [] });

    const { container } = render(
      <MemoryRouter>
        <AuthProvider>
          <AgendaPage />
        </AuthProvider>
      </MemoryRouter>,
    );
    await waitFor(() => expect(endpoints.listAppointments).toHaveBeenCalled());
    expectTablesToBeScrollable(container);
  });

  it('CallQueuePage', async () => {
    setSession({ token: 't1', role: 'OWNER', tenantId: 'tenant-1', email: 'owner@a.com' });
    vi.spyOn(endpoints, 'listAssignableUsers').mockResolvedValue({ users: [] });
    vi.spyOn(endpoints, 'listLeads').mockResolvedValue({
      leads: [buildLead({ state: 'HUMAN_HANDOFF' })],
      total: 1,
      page: 1,
      pageSize: 20,
    });

    const { container } = render(
      <MemoryRouter>
        <AuthProvider>
          <CallQueuePage />
        </AuthProvider>
      </MemoryRouter>,
    );
    await waitFor(() => expect(endpoints.listLeads).toHaveBeenCalled());
    expectTablesToBeScrollable(container);
  });

  it('PeoplePage', async () => {
    setSession({ token: 't1', role: 'OWNER', tenantId: 'tenant-1', email: 'owner@a.com' });
    vi.spyOn(endpoints, 'listPeople').mockResolvedValue({
      people: [
        { id: 'p1', tenantId: 'tenant-1', email: 'agente1@a.com', role: 'AGENT', active: true },
      ],
    });

    const { container } = render(
      <AuthProvider>
        <PeoplePage />
      </AuthProvider>,
    );
    await waitFor(() => expect(endpoints.listPeople).toHaveBeenCalled());
    expectTablesToBeScrollable(container);
  });

  it('AppLayout', async () => {
    setSession({ token: 't1', role: 'OWNER', tenantId: 'tenant-1', email: 'owner@a.com' });

    const { container } = render(
      <MemoryRouter initialEntries={['/']}>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<AppLayout />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    );
    await screen.findByText('Leads');
    expectTablesToBeScrollable(container);
  });
});
