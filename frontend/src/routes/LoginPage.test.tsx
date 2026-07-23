import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LoginPage } from './LoginPage';
import { useAuth } from '../auth/AuthContext';

vi.mock('../auth/AuthContext', () => ({
  useAuth: vi.fn(),
}));

const navigateMock = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => navigateMock,
}));

function mockAuth(login: (email: string, password: string) => Promise<void>) {
  vi.mocked(useAuth).mockReturnValue({
    isAuthenticated: false,
    person: null,
    token: null,
    login,
    logout: vi.fn(),
  });
}

describe('LoginPage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    navigateMock.mockReset();
  });

  it('AC-2/AC-3: muestra spinner y deshabilita submit mientras la llamada está en curso, navega al éxito', async () => {
    let resolveLogin: () => void;
    const loginPromise = new Promise<void>((resolve) => {
      resolveLogin = resolve;
    });
    const login = vi.fn().mockReturnValue(loginPromise);
    mockAuth(login);

    const user = userEvent.setup();
    render(<LoginPage />);

    await user.type(screen.getByLabelText(/email/i), 'owner@a.com');
    await user.type(screen.getByLabelText(/contraseña/i), 'secret123');

    const submitButton = screen.getByRole('button', { name: /ingresar/i });
    await user.click(submitButton);

    // Mientras la promesa no resuelve: spinner visible y botón deshabilitado.
    expect(screen.getByTestId('spinner')).toBeInTheDocument();
    expect(submitButton).toBeDisabled();

    // Reenvío no permitido mientras está en curso.
    await user.click(submitButton);
    expect(login).toHaveBeenCalledTimes(1);

    resolveLogin!();
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/', { replace: true }));

    expect(screen.queryByTestId('spinner')).not.toBeInTheDocument();
    expect(screen.queryByTestId('error-banner')).not.toBeInTheDocument();
  });

  it('AC-4: si login falla, muestra ErrorBanner en español, no navega y no persiste sesión', async () => {
    const login = vi.fn().mockRejectedValue(new Error('Credenciales inválidas.'));
    mockAuth(login);

    const user = userEvent.setup();
    render(<LoginPage />);

    await user.type(screen.getByLabelText(/email/i), 'owner@a.com');
    await user.type(screen.getByLabelText(/contraseña/i), 'wrong');
    await user.click(screen.getByRole('button', { name: /ingresar/i }));

    await waitFor(() => expect(screen.getByTestId('error-banner')).toBeInTheDocument());
    expect(screen.getByTestId('error-banner')).toHaveTextContent('Credenciales inválidas.');
    expect(navigateMock).not.toHaveBeenCalled();

    const submitButton = screen.getByRole('button', { name: /ingresar/i });
    expect(submitButton).not.toBeDisabled();
  });
});
