import { type ReactNode, useCallback, useEffect, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { Sidebar } from '../components/layout/Sidebar';
import { CommandPalette } from '../components/layout/CommandPalette';
import { navEntryForPath } from '../components/layout/nav-items';
import { Logo } from '../components/ui/Logo';
import { registerPushSubscriptionOnce } from '../push/register-push-subscription';

export function AppLayout({ children }: { children?: ReactNode }): JSX.Element {
  const { logout, token, person } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    if (token && person?.tenantId) {
      registerPushSubscriptionOnce(token, person.tenantId).catch((err) => {
        console.error('Error registering push subscription', err);
      });
    }
  }, [token, person?.tenantId]);

  // ⌘K / Ctrl+K abre la paleta desde cualquier pantalla. Es el atajo que
  // compensa haber sacado los íconos del rail: quien navega rápido tipea.
  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent): void => {
      if (event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const handleLogout = useCallback(async (): Promise<void> => {
    await logout();
    navigate('/login', { replace: true });
  }, [logout, navigate]);

  const current = navEntryForPath(location.pathname);

  return (
    <div className="flex min-h-screen bg-bg">
      <Sidebar
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
        onLogout={handleLogout}
        onOpenCommandPalette={() => setPaletteOpen(true)}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        {/*
          Header mobile: el índice completo vive en el drawer a tamaño display,
          así que acá solo queda la marca, la dirección de la sección actual en
          mono, y el disparador del índice. Sin hamburguesa genérica: el
          control dice ÍNDICE, que es lo que abre.
        */}
        <header className="sticky top-0 z-20 flex h-[var(--header-height-mobile)] items-center justify-between gap-3 border-b-2 border-border-strong bg-bg px-4 md:hidden">
          <div className="flex min-w-0 items-center gap-3">
            <Logo variant="mark" />
            {current && (
              <span className="u-meta truncate text-text-muted">
                {current.index} · {current.label}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="u-meta border border-border-strong px-2.5 py-1.5 text-text hover:bg-invert hover:text-on-invert"
            aria-label="Abrir menú"
          >
            Índice
          </button>
        </header>

        <main className="mx-auto w-full max-w-[var(--max-width-page)] flex-1 px-4 py-6 sm:px-8 lg:px-12 lg:py-10">
          {children ?? <Outlet />}
        </main>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}
