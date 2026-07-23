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
    <div>
      <h1>Iniciar sesión</h1>
      {errorMessage && <ErrorBanner message={errorMessage} />}
      <form onSubmit={handleSubmit}>
        <div>
          <label htmlFor="login-email">Email</label>
          <input
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
        <div>
          <label htmlFor="login-password">Contraseña</label>
          <input
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
        {loading && <Spinner text="Iniciando sesión..." />}
        <button type="submit" disabled={loading}>
          Ingresar
        </button>
      </form>
    </div>
  );
}
