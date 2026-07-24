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

import type { ReactNode } from 'react';
import { Link, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

export function AppLayout({ children }: { children?: ReactNode }): JSX.Element {
  const { person, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async (): Promise<void> => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div>
      <header>
        <nav>
          <Link to="/">Inicio</Link>
          <Link to="/leads">Leads</Link>
          <Link to="/dashboard">Panel</Link>
          <Link to="/agenda">Agenda</Link>
          {person?.role === 'OWNER' && <Link to="/people">Gestión de personas</Link>}
        </nav>
        <button type="button" onClick={handleLogout}>
          Cerrar sesión
        </button>
      </header>
      <main>{children ?? <Outlet />}</main>
    </div>
  );
}
