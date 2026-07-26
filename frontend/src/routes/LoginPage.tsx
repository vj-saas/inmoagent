import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { Spinner } from '../components/Spinner';
import { ErrorBanner } from '../components/ErrorBanner';
import { Card, CardBody, Input, Button } from '../components/ui';
import { Mail, Lock, Building2 } from 'lucide-react';

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
    <div className="relative flex min-h-screen w-full items-center justify-center bg-radial from-stone-100 via-stone-50 to-stone-100 p-6 overflow-hidden">
      {/* Decorative premium background elements */}
      <div className="absolute -top-40 -left-40 h-80 w-80 rounded-full bg-accent/5 blur-3xl" />
      <div className="absolute -bottom-40 -right-40 h-80 w-80 rounded-full bg-primary/5 blur-3xl" />

      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-white shadow-md mb-3">
            <Building2 className="h-6 w-6" />
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-text">InmoAgent</h2>
          <p className="text-sm text-text-muted mt-1">
            Gestión inteligente para profesionales inmobiliarios
          </p>
        </div>

        <Card className="w-full border-border/80 shadow-lg backdrop-blur-sm bg-white/95">
          <CardBody className="p-8">
            <div className="mb-6">
              <h1 className="text-xl font-bold text-text">Iniciar sesión</h1>
              <p className="text-xs text-text-muted mt-1">
                Ingresá tus credenciales para acceder al panel
              </p>
            </div>

            {errorMessage && (
              <div className="mb-4">
                <ErrorBanner message={errorMessage} />
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1">
                <label htmlFor="login-email" className="block text-xs font-semibold uppercase tracking-wider text-text-muted">
                  Email
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-text-muted/65">
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

              <div className="space-y-1">
                <label htmlFor="login-password" className="block text-xs font-semibold uppercase tracking-wider text-text-muted">
                  Contraseña
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-text-muted/65">
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

              {loading && (
                <div className="pt-2">
                  <Spinner text="Iniciando sesión..." />
                </div>
              )}

              <div className="pt-2">
                <Button type="submit" disabled={loading} className="w-full">
                  Ingresar
                </Button>
              </div>
            </form>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
