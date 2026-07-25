/**
 * Layout del area autenticada.
 *
 * - Muestra el link de navegacion a "Leads" para ambos roles
 *   `OWNER` y `AGENT` (AC-1; accesible desde el layout autenticado).
 * - Muestra el link de navegacion a "Panel" (dashboard) para ambos roles
 *   `OWNER` y `AGENT` (AC-8; accesible desde el layout autenticado).
 * - Muestra el link de navegacion a "Gestion de personas" solo si
 *   `person.role === 'OWNER'` (AC-7); un AGENT no debe verlo (AC-8).
 * - Muestra el link de navegacion a "Configuracion" solo si
 *   `person.role === 'OWNER'` (T18), mismo mecanismo que "Gestion de
 *   personas": un AGENT no debe verlo.
 * - El boton "Cerrar sesion" invoca `AuthContext.logout()` (que ya se ocupa
 *   de llamar a `endpoints.logout` y limpiar `session-store`) y redirige a
 *   `/login` (AC-5).
 */

import type { ReactNode } from 'react';
import { Link, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { Button } from '../components/ui';

const navLinkClassName = 'whitespace-nowrap text-sm font-medium text-text-muted hover:text-text';

export function AppLayout({ children }: { children?: ReactNode }): JSX.Element {
  const { person, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async (): Promise<void> => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between gap-4 border-b border-border bg-surface px-4 py-3 sm:px-6">
        <nav className="flex min-w-0 flex-1 items-center gap-5 overflow-x-auto">
          <Link to="/" className="whitespace-nowrap text-base font-semibold text-text">
            Agente Inmobiliario
          </Link>
          <Link to="/leads" className={navLinkClassName}>Leads</Link>
          <Link to="/dashboard" className={navLinkClassName}>Panel</Link>
          <Link to="/agenda" className={navLinkClassName}>Agenda</Link>
          <Link to="/llamar-hoy" className={navLinkClassName}>Llamar hoy</Link>
          {person?.role === 'OWNER' && (
            <Link to="/people" className={navLinkClassName}>Gestión de personas</Link>
          )}
          {person?.role === 'OWNER' && (
            <Link to="/configuracion" className={navLinkClassName}>Configuración</Link>
          )}
        </nav>
        <Button type="button" variant="secondary" size="sm" onClick={handleLogout}>
          Cerrar sesión
        </Button>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6">
        {children ?? <Outlet />}
      </main>
    </div>
  );
}
