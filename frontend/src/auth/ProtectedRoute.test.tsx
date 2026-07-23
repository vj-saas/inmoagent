import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { AuthProvider } from './AuthContext';
import { ProtectedRoute } from './ProtectedRoute';
import { clearSession, setSession } from './session-store';

function renderProtected(initialEntry: string): void {
  render(
    <AuthProvider>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/login" element={<div>pantalla de login</div>} />
          <Route
            path="/protegida"
            element={
              <ProtectedRoute>
                <div>contenido protegido</div>
              </ProtectedRoute>
            }
          />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );
}

describe('ProtectedRoute', () => {
  beforeEach(() => {
    clearSession();
  });

  it('sin sesion valida redirige a /login y no renderiza el contenido protegido', () => {
    renderProtected('/protegida');

    expect(screen.getByText('pantalla de login')).toBeInTheDocument();
    expect(screen.queryByText('contenido protegido')).not.toBeInTheDocument();
  });

  it('con sesion valida renderiza el contenido protegido sin redirigir', () => {
    setSession({
      token: 'token-123',
      role: 'OWNER',
      tenantId: 'tenant-1',
      email: 'owner@test.com',
    });

    renderProtected('/protegida');

    expect(screen.getByText('contenido protegido')).toBeInTheDocument();
    expect(screen.queryByText('pantalla de login')).not.toBeInTheDocument();
  });
});
