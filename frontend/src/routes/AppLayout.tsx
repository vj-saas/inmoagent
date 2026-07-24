/**
 * Layout del area autenticada.
 *
 * - Muestra el link de navegacion a "Leads" para ambos roles
 *   `OWNER` y `AGENT` (AC-1; accesible desde el layout autenticado).
 * - Muestra el link de navegacion a "Panel" (dashboard) para ambos roles
 *   `OWNER` y `AGENT` (AC-8; accesible desde el layout autenticado).
 * - Muestra el link de navegacion a "Gestion de personas" solo si
 *   `person.role === 'OWNER'` (AC-7); un AGENT no debe verlo (AC-8).
 * - El boton "Cerrar sesion" invoca `AuthContext.logout()` (que ya se ocupa
 *   de llamar a `endpoints.logout` y limpiar `session-store`) y redirige a
 *   `/login` (AC-5).
 */

import type { CSSProperties, ReactNode } from 'react';
import { Link, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

export function AppLayout({ children }: { children?: ReactNode }): JSX.Element {
  const { person, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async (): Promise<void> => {
    await logout();
    navigate('/login', { replace: true });
  };

  const navLinkStyle: CSSProperties = {
    color: 'var(--color-text-muted)',
    fontWeight: 500,
    fontSize: '0.9rem',
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 24px',
          backgroundColor: 'var(--color-surface)',
          borderBottom: '1px solid var(--color-border)',
        }}
      >
        <nav style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <Link to="/" style={{ fontWeight: 700, color: 'var(--color-text)', fontSize: '1rem' }}>
            Agente Inmobiliario
          </Link>
          <Link to="/leads" style={navLinkStyle}>Leads</Link>
          <Link to="/dashboard" style={navLinkStyle}>Panel</Link>
          <Link to="/agenda" style={navLinkStyle}>Agenda</Link>
          <Link to="/llamar-hoy" style={navLinkStyle}>Llamar hoy</Link>
          {person?.role === 'OWNER' && (
            <Link to="/people" style={navLinkStyle}>Gestión de personas</Link>
          )}
        </nav>
        <button type="button" onClick={handleLogout}>
          Cerrar sesión
        </button>
      </header>
      <main style={{ flex: 1, padding: '24px', maxWidth: '1200px', width: '100%', margin: '0 auto' }}>
        {children ?? <Outlet />}
      </main>
    </div>
  );
}
