/**
 * Contexto de sesion de la app.
 *
 * - Hidrata el estado inicial leyendo `session-store.getSession()` al montar
 *   (AC-16: si habia sesion valida, la persona sigue autenticada tras un
 *   reload sin volver a loguearse).
 * - `login(email, password)`: invoca `endpoints.login`, guarda `{ token }`,
 *   completa el resto de la sesion con `endpoints.getMe()` y persiste todo.
 * - `logout()`: invoca `endpoints.logout`, limpia session-store y resetea el
 *   estado.
 * - Registra `onUnauthorized` de `http-client` UNA VEZ al montar el provider:
 *   ante un 401 en cualquier llamada, limpia session-store y resetea el
 *   estado del contexto (AC-6). La redireccion a `/login` la dispara quien
 *   consuma `isAuthenticated` (ver ProtectedRoute, tarea separada), no este
 *   modulo (no importa react-router).
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { getMe, login as loginRequest, logout as logoutRequest } from '../api/endpoints';
import { onUnauthorized } from '../api/http-client';
import {
  clearSession,
  getSession,
  setSession,
  type Session,
} from './session-store';

export interface Person {
  role: Session['role'];
  tenantId: string;
  email: string;
}

export interface AuthContextValue {
  isAuthenticated: boolean;
  person: Person | null;
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function toPerson(session: Session): Person {
  return { role: session.role, tenantId: session.tenantId, email: session.email };
}

export function AuthProvider({ children }: { children: ReactNode }): JSX.Element {
  const initialSession = getSession();
  const [session, setSessionState] = useState<Session | null>(initialSession);

  // Evita resets multiples/reentrantes ante 401 concurrentes.
  const resettingRef = useRef(false);

  useEffect(() => {
    onUnauthorized(() => {
      if (resettingRef.current) {
        return;
      }
      resettingRef.current = true;
      clearSession();
      setSessionState(null);
      resettingRef.current = false;
    });
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const { token } = await loginRequest(email, password);
    const me = await getMe(token);
    const fullSession: Session = {
      token,
      role: me.role,
      tenantId: me.tenantId,
      email: me.email,
    };
    setSession(fullSession);
    setSessionState(fullSession);
  }, []);

  const logout = useCallback(async () => {
    const currentToken = session?.token;
    try {
      if (currentToken) {
        await logoutRequest(currentToken);
      }
    } finally {
      clearSession();
      setSessionState(null);
    }
  }, [session]);

  const value: AuthContextValue = {
    isAuthenticated: session !== null,
    person: session ? toPerson(session) : null,
    token: session?.token ?? null,
    login,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth debe usarse dentro de un AuthProvider');
  }
  return context;
}
