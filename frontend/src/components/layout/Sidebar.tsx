import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import {
  Calendar,
  ChevronsLeft,
  ChevronsRight,
  ClipboardList,
  Home,
  LayoutDashboard,
  LogOut,
  Phone,
  Settings,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import { Logo } from '../ui/Logo';
import { ThemeToggle } from '../ui/ThemeToggle';
import { Button } from '../ui/Button';
import { cn } from '../../lib/cn';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const COLLAPSE_KEY = 'inmoagent-sidebar-collapsed';

function NavItemLink({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      title={collapsed ? item.label : undefined}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors duration-150',
          collapsed && 'justify-center px-0',
          isActive
            ? 'bg-primary text-white shadow-sm'
            : 'text-text-muted hover:bg-bg hover:text-text'
        )
      }
    >
      <Icon className="h-4.5 w-4.5 shrink-0" aria-hidden="true" />
      <span className={collapsed ? 'sr-only' : 'truncate'}>{item.label}</span>
    </NavLink>
  );
}

function NavGroupBlock({ group, collapsed }: { group: NavGroup; collapsed: boolean }) {
  return (
    <div className="flex flex-col gap-1">
      {!collapsed && (
        <span className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-text-faint">
          {group.label}
        </span>
      )}
      {group.items.map((item) => (
        <NavItemLink key={item.to} item={item} collapsed={collapsed} />
      ))}
    </div>
  );
}

export interface SidebarProps {
  mobileOpen: boolean;
  onCloseMobile: () => void;
  onLogout: () => void;
}

export function Sidebar({ mobileOpen, onCloseMobile, onLogout }: SidebarProps) {
  const { person } = useAuth();
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSE_KEY) === '1');

  useEffect(() => {
    localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0');
  }, [collapsed]);

  const groups: NavGroup[] = [
    {
      label: 'Actividad',
      items: [
        { to: '/dashboard', label: 'Panel', icon: LayoutDashboard },
        { to: '/llamar-hoy', label: 'Llamar hoy', icon: Phone },
        { to: '/agenda', label: 'Agenda', icon: Calendar },
      ],
    },
    {
      label: 'Gestión',
      items: [
        { to: '/leads', label: 'Leads', icon: ClipboardList },
        { to: '/propiedades', label: 'Propiedades', icon: Home },
      ],
    },
  ];

  if (person?.role === 'OWNER') {
    groups.push({
      label: 'Administración',
      items: [
        { to: '/people', label: 'Gestión de personas', icon: Users },
        { to: '/configuracion', label: 'Configuración', icon: Settings },
      ],
    });
  }

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
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-[var(--sidebar-width)] flex-col border-r border-border bg-surface transition-transform duration-200 ease-out',
          'md:relative md:z-auto md:h-screen md:translate-x-0',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
          collapsed ? 'md:w-[var(--sidebar-width-collapsed)]' : 'md:w-[var(--sidebar-width)]'
        )}
        aria-label="Navegación principal"
      >
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-4">
          <Logo variant={collapsed ? 'mark' : 'full'} />
          <button
            type="button"
            onClick={onCloseMobile}
            className="rounded-md p-1 text-text-muted hover:bg-bg hover:text-text md:hidden"
            aria-label="Cerrar menú"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex flex-1 flex-col gap-5 overflow-y-auto px-3 py-4">
          {groups.map((group) => (
            <NavGroupBlock key={group.label} group={group} collapsed={collapsed} />
          ))}
        </nav>

        <div className="flex flex-col gap-3 border-t border-border px-3 py-4">
          {person && !collapsed && (
            <div className="px-1">
              <p className="truncate text-xs font-semibold text-text">{person.email}</p>
              <span className="mt-0.5 inline-flex items-center rounded-full bg-accent/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-accent">
                {person.role}
              </span>
            </div>
          )}

          <ThemeToggle compact={collapsed} />

          <Button
            type="button"
            variant="secondary"
            size={collapsed ? 'icon' : 'sm'}
            onClick={onLogout}
            aria-label="Cerrar sesión"
            className={collapsed ? undefined : 'justify-start gap-2'}
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            {!collapsed && <span>Cerrar sesión</span>}
          </Button>

          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            className="hidden items-center justify-center gap-2 rounded-md px-2 py-1.5 text-xs font-medium text-text-faint hover:bg-bg hover:text-text-muted md:flex"
            aria-label={collapsed ? 'Expandir menú' : 'Colapsar menú'}
          >
            {collapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
            {!collapsed && <span>Colapsar</span>}
          </button>
        </div>
      </aside>
    </>
  );
}
