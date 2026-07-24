import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { AppRoutes } from './App';
import { AuthProvider } from './auth/AuthContext';
import { clearSession, setSession } from './auth/session-store';

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

  it('con sesion, navegar a /leads/:leadId renderiza LeadDetailPage con el id correcto', () => {
    setSession({
      token: 'token-123',
      role: 'OWNER',
      tenantId: 'tenant-1',
      email: 'owner@test.com',
    });

    renderApp('/leads/lead-42');

    expect(screen.getByRole('heading', { name: /ficha del lead/i })).toBeInTheDocument();
    expect(screen.getByText(/lead-42/)).toBeInTheDocument();
  });
});
