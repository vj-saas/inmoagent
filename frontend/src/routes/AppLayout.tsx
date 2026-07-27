import { type ReactNode, useState } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { Menu } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { Sidebar } from '../components/layout/Sidebar';
import { Logo } from '../components/ui/Logo';

export function AppLayout({ children }: { children?: ReactNode }): JSX.Element {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = async (): Promise<void> => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="flex min-h-screen bg-bg">
      <Sidebar
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
        onLogout={handleLogout}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Header mobile mínimo: solo hamburguesa + isotipo, la navegación vive en el drawer */}
        <header className="sticky top-0 z-20 flex h-[var(--header-height-mobile)] items-center gap-3 border-b border-border bg-surface px-4 md:hidden">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="rounded-md p-1.5 text-text-muted hover:bg-bg hover:text-text"
            aria-label="Abrir menú"
          >
            <Menu className="h-5 w-5" />
          </button>
          <Logo variant="mark" />
        </header>

        <main className="mx-auto w-full max-w-[var(--max-width-page)] flex-1 px-4 py-6 sm:px-6 lg:px-8">
          {children ?? <Outlet />}
        </main>
      </div>
    </div>
  );
}
