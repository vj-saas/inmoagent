/**
 * Pantalla de login.
 *
 * - Formulario de email + contraseña en español.
 * - Al enviar, invoca `AuthContext.login(email, password)` (que a su vez usa
 *   `endpoints.login` + `endpoints.getMe`).
 * - Mientras la llamada está en curso: muestra `Spinner` y deshabilita el
 *   botón de submit para no permitir reenvío (AC-3).
 * - Si tiene éxito: navega al área autenticada con `useNavigate` (AC-2).
 * - Si falla: muestra `ErrorBanner` con mensaje legible en español, sin
 *   navegar ni persistir sesión — `AuthContext.login` no persiste nada si
 *   `endpoints.login`/`endpoints.getMe` rechazan, así que no hay limpieza
 *   adicional que hacer acá (AC-4).
 */

import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { Spinner } from '../components/Spinner';
import { ErrorBanner } from '../components/ErrorBanner';
import { Card, CardBody, Input, Button } from '../components/ui';

export function LoginPage(): JSX.Element {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (loading) {
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    try {
      await login(email, password);
      navigate('/', { replace: true });
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'No se pudo iniciar sesión. Intentá nuevamente.';
      setErrorMessage(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen w-full items-center justify-center p-6">
      <Card className="w-full max-w-[380px]">
        <CardBody className="p-8">
          <h1 className="mb-1 text-2xl font-semibold text-text">Iniciar sesión</h1>
          <p className="mb-6 mt-0 text-sm text-text-muted">
            Panel de control del agente inmobiliario
          </p>
          {errorMessage && (
            <div className="mb-4">
              <ErrorBanner message={errorMessage} />
            </div>
          )}
          <form onSubmit={handleSubmit}>
            <div className="mb-4">
              <label htmlFor="login-email" className="mb-1 block text-sm font-medium text-text">
                Email
              </label>
              <Input
                id="login-email"
                name="email"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                required
              />
            </div>
            <div className="mb-5">
              <label htmlFor="login-password" className="mb-1 block text-sm font-medium text-text">
                Contraseña
              </label>
              <Input
                id="login-password"
                name="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                required
              />
            </div>
            {loading && (
              <div className="mb-4">
                <Spinner text="Iniciando sesión..." />
              </div>
            )}
            <Button type="submit" disabled={loading} className="w-full">
              Ingresar
            </Button>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
