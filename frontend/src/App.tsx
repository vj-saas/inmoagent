/**
 * Router principal de la app.
 *
 * - `/login` es publica (sin `ProtectedRoute`).
 * - Todo lo demas vive bajo `ProtectedRoute` + `AppLayout` (que renderiza un
 *   `Outlet`), asi cada ruta hija comparte el layout autenticado (nav,
 *   boton de logout).
 * - `/` redirige a `/leads` (AC-13).
 * - `/leads` (index) -> `LeadsPage`, `/leads/:leadId` -> `LeadDetailPage`.
 * - `/people` -> `PeoplePage` (gestion de personas, ya restringida por rol
 *   dentro de `AppLayout`/`PeoplePage`).
 *
 * `AppRoutes` se exporta por separado (sin `BrowserRouter`) para poder
 * testearla envuelta en `MemoryRouter` con rutas iniciales controladas.
 */

import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import { ProtectedRoute } from './auth/ProtectedRoute';
import { AppLayout } from './routes/AppLayout';
import { LoginPage } from './routes/LoginPage';
import { LeadsPage } from './routes/LeadsPage';
import { LeadDetailPage } from './routes/LeadDetailPage';
import { PeoplePage } from './routes/PeoplePage';
import { DashboardPage } from './routes/DashboardPage';
import { AgendaPage } from './routes/AgendaPage';
import { CallQueuePage } from './routes/CallQueuePage';

export function AppRoutes(): JSX.Element {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/leads" replace />} />
        <Route path="leads" element={<LeadsPage />} />
        <Route path="leads/:leadId" element={<LeadDetailPage />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="agenda" element={<AgendaPage />} />
        <Route path="llamar-hoy" element={<CallQueuePage />} />
        <Route path="people" element={<PeoplePage />} />
      </Route>
    </Routes>
  );
}

export default function App(): JSX.Element {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
