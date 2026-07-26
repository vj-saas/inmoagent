import type { ReactNode } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { Button } from '../components/ui';
import { 
  Building2, 
  Users, 
  Settings, 
  LayoutDashboard, 
  Calendar, 
  ClipboardList, 
  Phone, 
  Home, 
  LogOut 
} from 'lucide-react';

export function AppLayout({ children }: { children?: ReactNode }): JSX.Element {
  const { person, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async (): Promise<void> => {
    await logout();
    navigate('/login', { replace: true });
  };

  const navLinkClassName = ({ isActive }: { isActive: boolean }) =>
    `inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 whitespace-nowrap ${
      isActive
        ? 'bg-primary text-white shadow-sm'
        : 'text-text-muted hover:text-text hover:bg-stone-100/70'
    }`;

  return (
    <div className="flex min-h-screen flex-col bg-bg">
      {/* Sticky responsive header using flex ordering to avoid DOM duplication */}
      <header className="sticky top-0 z-50 flex flex-wrap md:flex-nowrap items-center justify-between gap-y-3.5 gap-x-4 border-b border-border/80 bg-white/90 backdrop-blur-md px-4 py-3 sm:px-6 shadow-xs">
        {/* Logo (Order 1) */}
        <Link to="/" className="flex items-center gap-2 whitespace-nowrap text-base font-bold text-text group transition-colors order-1">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-white shadow-xs group-hover:scale-105 transition-transform duration-200">
            <Building2 className="h-4.5 w-4.5" />
          </div>
          <span className="tracking-tight">InmoAgent</span>
        </Link>

        {/* Navigation - Single DOM Instance (Order 3 on mobile, Order 2 on desktop) */}
        <nav className="flex items-center gap-1 overflow-x-auto w-full md:w-auto order-3 md:order-2 min-w-0 py-0.5 scrollbar-none flex-nowrap">
          <NavLink to="/leads" className={navLinkClassName}>
            <ClipboardList className="h-4 w-4" />
            <span>Leads</span>
          </NavLink>
          <NavLink to="/dashboard" className={navLinkClassName}>
            <LayoutDashboard className="h-4 w-4" />
            <span>Panel</span>
          </NavLink>
          <NavLink to="/agenda" className={navLinkClassName}>
            <Calendar className="h-4 w-4" />
            <span>Agenda</span>
          </NavLink>
          <NavLink to="/llamar-hoy" className={navLinkClassName}>
            <Phone className="h-4 w-4" />
            <span>Llamar hoy</span>
          </NavLink>
          <NavLink to="/propiedades" className={navLinkClassName}>
            <Home className="h-4 w-4" />
            <span>Propiedades</span>
          </NavLink>
          {person?.role === 'OWNER' && (
            <NavLink to="/people" className={navLinkClassName}>
              <Users className="h-4 w-4" />
              <span>Gestión de personas</span>
            </NavLink>
          )}
          {person?.role === 'OWNER' && (
            <NavLink to="/configuracion" className={navLinkClassName}>
              <Settings className="h-4 w-4" />
              <span>Configuración</span>
            </NavLink>
          )}
        </nav>

        {/* Profile and Logout Actions (Order 2 on mobile, Order 3 on desktop) */}
        <div className="flex items-center gap-3 order-2 md:order-3 ml-auto md:ml-0">
          {person && (
            <div className="hidden sm:flex flex-col items-end text-right min-w-0 pr-1">
              <span className="text-xs font-semibold text-text truncate max-w-[180px]">{person.email}</span>
              <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-accent/10 text-accent uppercase tracking-wider mt-0.5">
                {person.role}
              </span>
            </div>
          )}
          
          <Button 
            type="button" 
            variant="secondary" 
            size="sm" 
            onClick={handleLogout}
            aria-label="Cerrar sesión"
            className="gap-1.5 border-border hover:bg-stone-50 text-text font-medium text-xs h-8.5"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Cerrar sesión</span>
            <span className="sm:hidden">Salir</span>
          </Button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
        {children ?? <Outlet />}
      </main>
    </div>
  );
}
