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
      {/*
        Panel de marca — solo desktop. Bloque de tinta macizo con la grilla
        de la retícula apenas insinuada (líneas de 1px, sin degradado) y el
        titular a tamaño de tapa: es la única pantalla de la app donde la
        tipografía puede ocupar todo el espacio que quiera.
      */}
      <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-invert px-14 py-12 text-on-invert lg:flex">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              'linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)',
            backgroundSize: '48px 48px',
          }}
          aria-hidden="true"
        />
        <Logo variant="mark" className="relative" />

        <div className="relative max-w-xl">
          <span className="u-meta text-accent-loud">Agente comercial 24/7</span>
          <h1 className="u-display mt-5 text-[clamp(2.5rem,4.2vw,3.75rem)]">
            Responde leads mientras vos cerrás operaciones.
          </h1>
          <p className="mt-6 max-w-md border-l-2 border-accent-loud pl-4 text-sm leading-relaxed opacity-75">
            Calificación, búsqueda de propiedades y agenda de visitas, todos los días,
            en el WhatsApp de tu inmobiliaria.
          </p>
        </div>

        <p className="u-meta relative opacity-50">© {new Date().getFullYear()} InmoAgent</p>
      </div>

      {/* Formulario */}
      <div className="flex w-full flex-1 items-center justify-center p-6 lg:w-1/2">
        <div className="w-full max-w-sm space-y-8">
          <div className="space-y-3 lg:hidden">
            <Logo />
          </div>

          <div className="border-b-2 border-border-strong pb-4">
            <h2 className="u-display text-[clamp(1.75rem,4vw,2.25rem)] text-text">
              Iniciar sesión
            </h2>
            <p className="mt-2 text-sm text-text-muted">
              Ingresá tus credenciales para acceder al panel.
            </p>
          </div>

          {errorMessage && <ErrorBanner message={errorMessage} />}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-1.5">
              <label
                htmlFor="login-email"
                className="u-meta block text-text-muted"
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
                className="u-meta block text-text-muted"
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
