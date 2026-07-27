import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DashboardPage } from './DashboardPage';
import { AuthProvider } from '../auth/AuthContext';
import { clearSession, setSession } from '../auth/session-store';
import { onUnauthorized } from '../api/http-client';
import * as endpoints from '../api/endpoints';
import type { MetricsResult } from '../api/endpoints';

function renderDashboardPage(): void {
  render(
    <MemoryRouter>
      <AuthProvider>
        <DashboardPage />
      </AuthProvider>
    </MemoryRouter>,
  );
}

function buildMetrics(overrides: Partial<MetricsResult> = {}): MetricsResult {
  return {
    range: { from: '2026-06-24T00:00:00.000Z', to: '2026-07-24T23:59:59.999Z' },
    newLeads: 10,
    activeConversations: 5,
    handoffs: 2,
    appointments: { proposed: 3, confirmed: 1 },
    ...overrides,
  };
}

describe('DashboardPage', () => {
  beforeEach(() => {
    clearSession();
    onUnauthorized(() => {});
    setSession({ token: 't1', role: 'OWNER', tenantId: 'tenant-1', email: 'owner@a.com' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    clearSession();
  });

  it('carga inicial llama getMetrics con el tenantId correcto y el rango de 30 días por defecto', async () => {
    vi.spyOn(endpoints, 'getMetrics').mockResolvedValue(buildMetrics());

    renderDashboardPage();

    // Una llamada para el período seleccionado y otra para el período
    // anterior de igual longitud (comparación real, sin serie diaria fabricada).
    await waitFor(() => expect(endpoints.getMetrics).toHaveBeenCalledTimes(2));

    const [tenantId, query, token] = vi.mocked(endpoints.getMetrics).mock.calls[0];
    expect(tenantId).toBe('tenant-1');
    expect(token).toBe('t1');

    const from = new Date(query.from);
    const to = new Date(query.to);
    const diffDays = Math.round((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
    expect(diffDays).toBeGreaterThanOrEqual(29);
    expect(diffDays).toBeLessThanOrEqual(31);

    const [previousTenantId, previousQuery] = vi.mocked(endpoints.getMetrics).mock.calls[1];
    expect(previousTenantId).toBe('tenant-1');
    const previousFrom = new Date(previousQuery.from);
    const previousTo = new Date(previousQuery.to);
    // El período anterior termina justo antes de que empiece el seleccionado.
    expect(previousTo.getTime()).toBeLessThan(from.getTime());
    const previousDiffDays = Math.round(
      (previousTo.getTime() - previousFrom.getTime()) / (1000 * 60 * 60 * 24),
    );
    expect(previousDiffDays).toBeGreaterThanOrEqual(29);
    expect(previousDiffDays).toBeLessThanOrEqual(31);
  });

  it('muestra Spinner mientras loading', async () => {
    let resolvePromise: (value: MetricsResult) => void = () => {};
    vi.spyOn(endpoints, 'getMetrics').mockReturnValue(
      new Promise((resolve) => {
        resolvePromise = resolve;
      }),
    );

    renderDashboardPage();

    expect(await screen.findByTestId('spinner')).toBeInTheDocument();

    resolvePromise(buildMetrics());
    await waitFor(() => expect(screen.queryByTestId('spinner')).not.toBeInTheDocument());
  });

  it('muestra ErrorBanner si falla la carga', async () => {
    vi.spyOn(endpoints, 'getMetrics').mockRejectedValue(new Error('Error de red.'));

    renderDashboardPage();

    expect(await screen.findByTestId('error-banner')).toHaveTextContent('Error de red.');
    expect(screen.queryAllByTestId('metric-card')).toHaveLength(0);
  });

  it('con datos, muestra las cinco tarjetas con los valores correctos', async () => {
    vi.spyOn(endpoints, 'getMetrics').mockResolvedValue(
      buildMetrics({
        newLeads: 42,
        activeConversations: 7,
        handoffs: 3,
        appointments: { proposed: 9, confirmed: 4 },
      }),
    );

    renderDashboardPage();

    const cards = await screen.findAllByTestId('metric-card');
    expect(cards).toHaveLength(5);

    expect(screen.getByText('Leads nuevos')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText('Conversaciones activas')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
    expect(screen.getByText('Handoffs')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('Citas propuestas')).toBeInTheDocument();
    expect(screen.getByText('9')).toBeInTheDocument();
    expect(screen.getByText('Citas confirmadas')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();

    expect(screen.queryByTestId('spinner')).not.toBeInTheDocument();
    expect(screen.queryByTestId('error-banner')).not.toBeInTheDocument();
  });

  it('un rango inválido muestra el mensaje de validación sin reinvocar getMetrics', async () => {
    vi.spyOn(endpoints, 'getMetrics').mockResolvedValue(buildMetrics());

    renderDashboardPage();
    await waitFor(() => expect(endpoints.getMetrics).toHaveBeenCalledTimes(2));

    const fromInput = screen.getByTestId('date-range-from');
    fireEvent.change(fromInput, { target: { value: '2099-01-01' } });

    expect(
      await screen.findByText('La fecha desde no puede ser posterior a la fecha hasta'),
    ).toBeInTheDocument();

    expect(endpoints.getMetrics).toHaveBeenCalledTimes(2);
    expect(screen.queryAllByTestId('metric-card')).toHaveLength(0);
  });
});
