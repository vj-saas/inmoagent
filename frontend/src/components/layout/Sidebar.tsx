import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { LogOut, X } from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import { Logo } from '../ui/Logo';
import { ThemeToggle } from '../ui/ThemeToggle';
import { Meta } from '../ui/Meta';
import { cn } from '../../lib/cn';
import { visibleNavGroups, type NavEntry, type NavGroup } from './nav-items';

const COLLAPSE_KEY = 'inmoagent-sidebar-collapsed';

/**
 * Ítem del índice. Sin ícono: el número ES el ícono.
 *
 * - Reposo: número en mono apagado + label en Archivo.
 * - Hover: barrido de la línea de acento de izquierda a derecha.
 * - Activo: bloque macizo invertido con el número en acento. No es una
 *   "pill" ni un fondo suave — la sección activa se lee como un bloque de
 *   tinta impreso sobre el papel.
 * - En mobile el mismo markup crece a tamaño display (el drawer es un índice
 *   tipográfico a pantalla completa, no una lista de links achicada).
 */
function NavIndexItem({
  entry,
  collapsed,
  onNavigate,
}: {
  entry: NavEntry;
  collapsed: boolean;
  onNavigate: () => void;
}) {
  return (
    <NavLink
      to={entry.to}
      onClick={onNavigate}
      title={collapsed ? entry.label : undefined}
      className={({ isActive }) =>
        cn(
          'group relative flex items-baseline gap-3 border-l-2 py-2.5 pl-3 pr-2 transition-colors',
          collapsed && 'md:justify-center md:gap-0 md:px-0',
          isActive
            ? 'border-l-accent-loud bg-invert text-on-invert'
            : 'border-l-transparent text-text-muted hover:text-text',
        )
      }
    >
      {({ isActive }) => (
        <>
          <span
            aria-hidden="true"
            className={cn(
              'u-meta shrink-0 tabular-nums',
              isActive ? 'text-accent-loud' : 'text-text-faint',
            )}
          >
            {entry.index}
          </span>

          <span
            className={cn(
              'relative truncate text-xl font-semibold tracking-tight md:text-[0.9375rem]',
              collapsed && 'md:sr-only',
            )}
          >
            {entry.label}
            {!isActive && (
              <span
                aria-hidden="true"
                className="u-wipe-line origin-left scale-x-0 transition-transform duration-200 ease-out group-hover:scale-x-100"
              />
            )}
          </span>
        </>
      )}
    </NavLink>
  );
}

function NavIndexGroup({
  group,
  collapsed,
  onNavigate,
}: {
  group: NavGroup;
  collapsed: boolean;
  onNavigate: () => void;
}) {
  return (
    <div className="border-t border-border pt-3">
      <Meta as="div" className={cn('pb-1 pl-5', collapsed && 'md:sr-only')}>
        {group.label}
      </Meta>
      {group.entries.map((entry) => (
        <NavIndexItem
          key={entry.to}
          entry={entry}
          collapsed={collapsed}
          onNavigate={onNavigate}
        />
      ))}
    </div>
  );
}

export interface SidebarProps {
  mobileOpen: boolean;
  onCloseMobile: () => void;
  onLogout: () => void;
  /** Abre la paleta de comandos desde el pie del rail. */
  onOpenCommandPalette?: () => void;
}

export function Sidebar({
  mobileOpen,
  onCloseMobile,
  onLogout,
  onOpenCommandPalette,
}: SidebarProps) {
  const { person } = useAuth();
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSE_KEY) === '1');

  useEffect(() => {
    localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0');
  }, [collapsed]);

  const groups = visibleNavGroups(person?.role);

  return (
    <>
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-overlay md:hidden"
          onClick={onCloseMobile}
          aria-hidden="true"
        />
      )}

      <aside
        // `nav-drawer` + `data-open` resuelven el desplazamiento del drawer en
        // CSS plano (ver index.css): fuera de pantalla en mobile, fijo en
        // desktop. No se usan las utilidades `translate-x-*` de Tailwind v4
        // porque el estado cerrado no resolvía y el drawer tapaba la pantalla.
        className={cn(
          'nav-drawer fixed inset-y-0 left-0 z-40 flex w-full max-w-sm flex-col border-r-2 border-border-strong bg-bg transition-transform duration-200 ease-out',
          'md:relative md:z-auto md:h-screen md:max-w-none',
          collapsed ? 'md:w-[var(--sidebar-width-collapsed)]' : 'md:w-[var(--sidebar-width)]',
        )}
        data-open={mobileOpen}
        aria-label="Navegación principal"
      >
        <div
          className={cn(
            'flex items-center justify-between gap-2 px-4 py-5',
            collapsed && 'md:justify-center md:px-2',
          )}
        >
          <Logo variant={collapsed ? 'mark' : 'full'} />
          <button
            type="button"
            onClick={onCloseMobile}
            className="p-1 text-text-muted hover:text-accent md:hidden"
            aria-label="Cerrar menú"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        <nav className="flex flex-1 flex-col gap-3 overflow-y-auto px-2 pb-4">
          {groups.map((group) => (
            <NavIndexGroup
              key={group.label}
              group={group}
              collapsed={collapsed}
              onNavigate={onCloseMobile}
            />
          ))}
        </nav>

        <div className="border-t-2 border-border-strong">
          {onOpenCommandPalette && (
            <button
              type="button"
              onClick={onOpenCommandPalette}
              className={cn(
                'flex w-full items-center justify-between gap-2 border-b border-border px-4 py-2.5 text-left text-text-muted hover:bg-invert hover:text-on-invert',
                collapsed && 'md:justify-center md:px-0',
              )}
            >
              <span className={cn('u-meta', collapsed && 'md:sr-only')}>Buscar sección</span>
              <span className="u-meta shrink-0 border border-current px-1.5 py-0.5">⌘K</span>
            </button>
          )}

          <div className={cn('flex flex-col gap-3 px-4 py-4', collapsed && 'md:px-2')}>
            {person && (
              <div className={cn('min-w-0', collapsed && 'md:sr-only')}>
                <p className="truncate font-mono text-xs text-text-muted">{person.email}</p>
                <span className="u-meta mt-1 inline-block bg-invert px-1.5 py-0.5 text-on-invert">
                  {person.role}
                </span>
              </div>
            )}

            <ThemeToggle compact={collapsed} />

            <button
              type="button"
              onClick={onLogout}
              aria-label="Cerrar sesión"
              className={cn(
                'u-meta inline-flex items-center gap-2 border border-border px-3 py-2 text-text-muted hover:border-danger hover:text-danger',
                collapsed ? 'md:justify-center md:px-0' : 'justify-start',
              )}
            >
              <LogOut className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className={cn(collapsed && 'md:sr-only')}>Cerrar sesión</span>
            </button>

            <button
              type="button"
              onClick={() => setCollapsed((v) => !v)}
              className="u-meta hidden items-center gap-2 text-text-faint hover:text-accent md:flex"
              aria-label={collapsed ? 'Expandir menú' : 'Colapsar menú'}
            >
              <span aria-hidden="true">{collapsed ? '»' : '«'}</span>
              <span className={cn(collapsed && 'md:sr-only')}>Colapsar</span>
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
