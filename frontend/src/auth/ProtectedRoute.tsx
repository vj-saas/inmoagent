/**
 * Ruta protegida.
 *
 * - Si no hay sesion valida (`isAuthenticated === false`), redirige a
 *   `/login` sin renderizar el contenido protegido (AC-1).
 * - `AuthContext` hidrata el estado inicial de forma sincrona leyendo
 *   `session-store` (sessionStorage) al montar, por lo que no existe un
 *   estado intermedio de "aun no determinado": en el primer render ya se
 *   sabe si hay sesion o no, evitando el parpadeo de redirigir y luego
 *   "descubrir" que si habia sesion.
 */

import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from './AuthContext';

export function ProtectedRoute({ children }: { children: ReactNode }): JSX.Element {
  const { isAuthenticated } = useAuth();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
