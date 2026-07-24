import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppLayout } from './AppLayout';
import { AuthProvider } from '../auth/AuthContext';
import { clearSession, setSession } from '../auth/session-store';
import { onUnauthorized } from '../api/http-client';
import * as endpoints from '../api/endpoints';

function renderAppLayout(): void {
  render(
    <MemoryRouter initialEntries={['/']}>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<AppLayout />} />
          <Route path="/login" element={<div>pantalla de login</div>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('AppLayout', () => {
  beforeEach(() => {
    clearSession();
    onUnauthorized(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    clearSession();
  });

  it('muestra el link de Leads para OWNER (AC-1)', () => {
    setSession({ token: 't1', role: 'OWNER', tenantId: 'tenant-1', email: 'owner@a.com' });

    renderAppLayout();

    expect(screen.getByText('Leads')).toBeInTheDocument();
  });

  it('muestra el link de Leads para AGENT (AC-1)', () => {
    setSession({ token: 't2', role: 'AGENT', tenantId: 'tenant-1', email: 'agent@a.com' });

    renderAppLayout();

    expect(screen.getByText('Leads')).toBeInTheDocument();
  });

  it('muestra el link de gestion de personas para OWNER (AC-7)', () => {
    setSession({ token: 't1', role: 'OWNER', tenantId: 'tenant-1', email: 'owner@a.com' });

    renderAppLayout();

    expect(screen.getByText('Gestión de personas')).toBeInTheDocument();
  });

  it('NO muestra el link de gestion de personas para AGENT (AC-8)', () => {
    setSession({ token: 't2', role: 'AGENT', tenantId: 'tenant-1', email: 'agent@a.com' });

    renderAppLayout();

    expect(screen.queryByText('Gestión de personas')).not.toBeInTheDocument();
  });

  it('logout invoca AuthContext.logout y redirige a /login (AC-5)', async () => {
    setSession({ token: 't1', role: 'OWNER', tenantId: 'tenant-1', email: 'owner@a.com' });
    vi.spyOn(endpoints, 'logout').mockResolvedValue({ ok: true });

    renderAppLayout();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Cerrar sesión' }));

    expect(endpoints.logout).toHaveBeenCalledWith('t1');
    expect(await screen.findByText('pantalla de login')).toBeInTheDocument();
  });
});
