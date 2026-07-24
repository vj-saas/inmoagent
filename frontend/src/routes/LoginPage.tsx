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
    <div
      style={{
        minHeight: '100vh',
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '380px',
          backgroundColor: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: '12px',
          boxShadow: 'var(--shadow-md)',
          padding: '32px',
        }}
      >
        <h1 style={{ fontSize: '1.5rem', marginBottom: '4px' }}>Iniciar sesión</h1>
        <p style={{ color: 'var(--color-text-muted)', marginTop: 0, marginBottom: '24px', fontSize: '0.9rem' }}>
          Panel de control del agente inmobiliario
        </p>
        {errorMessage && (
          <div style={{ marginBottom: '16px' }}>
            <ErrorBanner message={errorMessage} />
          </div>
        )}
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '16px' }}>
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
          <div style={{ marginBottom: '20px' }}>
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
          {loading && (
            <div style={{ marginBottom: '16px' }}>
              <Spinner text="Iniciando sesión..." />
            </div>
          )}
          <button type="submit" disabled={loading} style={{ width: '100%' }}>
            Ingresar
          </button>
        </form>
      </div>
    </div>
  );
}
