import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { Spinner } from '../components/Spinner';
import { ErrorBanner } from '../components/ErrorBanner';
import { Input, Button, Logo } from '../components/ui';
import { Mail, Lock } from 'lucide-react';

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
    <div className="flex min-h-screen w-full bg-bg">
      {/* Panel de marca — solo desktop. Grilla Swiss: reglas finas, tipografía como protagonista. */}
      <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-primary px-16 py-14 text-white lg:flex">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage:
              'linear-gradient(to right, white 1px, transparent 1px), linear-gradient(to bottom, white 1px, transparent 1px)',
            backgroundSize: '48px 48px',
          }}
          aria-hidden="true"
        />
        <Logo variant="mark" className="relative" />
        <div className="relative max-w-md">
          <p className="mb-4 text-xs font-semibold uppercase tracking-wide text-white/60">
            Panel de control
          </p>
          <h1 className="text-4xl font-bold leading-tight tracking-tight text-white">
            El agente que responde leads mientras vos cerrás operaciones.
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-white/70">
            Calificación, búsqueda de propiedades y agenda de visitas, 24/7,
            en el WhatsApp de tu inmobiliaria.
          </p>
        </div>
        <p className="relative text-xs text-white/40">
          © {new Date().getFullYear()} InmoAgent
        </p>
      </div>

      {/* Formulario */}
      <div className="flex w-full flex-1 items-center justify-center p-6 lg:w-1/2">
        <div className="w-full max-w-sm space-y-8">
          <div className="space-y-3 lg:hidden">
            <Logo />
          </div>

          <div>
            <h2 className="text-2xl font-bold tracking-tight text-text">Iniciar sesión</h2>
            <p className="mt-1 text-sm text-text-muted">
              Ingresá tus credenciales para acceder al panel.
            </p>
          </div>

          {errorMessage && <ErrorBanner message={errorMessage} />}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-1.5">
              <label
                htmlFor="login-email"
                className="block text-xs font-semibold uppercase tracking-wide text-text-muted"
              >
                Email
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-text-faint">
                  <Mail className="h-4 w-4" />
                </span>
                <Input
                  id="login-email"
                  name="email"
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={loading}
                  required
                  className="pl-10"
                  placeholder="ejemplo@inmobiliaria.com"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="login-password"
                className="block text-xs font-semibold uppercase tracking-wide text-text-muted"
              >
                Contraseña
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-text-faint">
                  <Lock className="h-4 w-4" />
                </span>
                <Input
                  id="login-password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                  required
                  className="pl-10"
                  placeholder="••••••••"
                />
              </div>
            </div>

            {loading && <Spinner text="Iniciando sesión..." />}

            <Button type="submit" size="lg" disabled={loading} className="w-full">
              Ingresar
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
