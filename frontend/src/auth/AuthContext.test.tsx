import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from './AuthContext';
import { clearSession, setSession } from './session-store';
import { onUnauthorized } from '../api/http-client';
import * as httpClient from '../api/http-client';
import * as endpoints from '../api/endpoints';

function TestConsumer() {
  const { isAuthenticated, person, login, logout } = useAuth();
  return (
    <div>
      <div data-testid="authenticated">{String(isAuthenticated)}</div>
      <div data-testid="role">{person?.role ?? ''}</div>
      <div data-testid="tenantId">{person?.tenantId ?? ''}</div>
      <div data-testid="email">{person?.email ?? ''}</div>
      <button onClick={() => login('a@a.com', 'secret').catch(() => {})}>login</button>
      <button onClick={() => logout()}>logout</button>
    </div>
  );
}

describe('AuthContext', () => {
  beforeEach(() => {
    clearSession();
    onUnauthorized(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    clearSession();
  });

  it('hidrata el estado desde session-store al montar', () => {
    setSession({ token: 't1', role: 'OWNER', tenantId: 'tenant-1', email: 'owner@a.com' });

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    expect(screen.getByTestId('authenticated').textContent).toBe('true');
    expect(screen.getByTestId('role').textContent).toBe('OWNER');
    expect(screen.getByTestId('tenantId').textContent).toBe('tenant-1');
    expect(screen.getByTestId('email').textContent).toBe('owner@a.com');
  });

  it('sin sesion previa arranca no autenticado', () => {
    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    expect(screen.getByTestId('authenticated').textContent).toBe('false');
  });

  it('login exitoso deja el contexto autenticado con role/tenantId', async () => {
    vi.spyOn(endpoints, 'login').mockResolvedValue({ token: 'tok-123' });
    vi.spyOn(endpoints, 'getMe').mockResolvedValue({
      id: 'p1',
      role: 'AGENT',
      tenantId: 'tenant-2',
      email: 'agent@a.com',
    });

    const user = userEvent.setup();
    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    await user.click(screen.getByText('login'));

    await waitFor(() => {
      expect(screen.getByTestId('authenticated').textContent).toBe('true');
    });
    expect(screen.getByTestId('role').textContent).toBe('AGENT');
    expect(screen.getByTestId('tenantId').textContent).toBe('tenant-2');
    expect(screen.getByTestId('email').textContent).toBe('agent@a.com');
  });

  it('login fallido no autentica', async () => {
    vi.spyOn(endpoints, 'login').mockRejectedValue(new Error('credenciales invalidas'));
    const getMeSpy = vi.spyOn(endpoints, 'getMe');

    const user = userEvent.setup();
    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    await user.click(screen.getByText('login'));

    await waitFor(() => {
      expect(screen.getByTestId('authenticated').textContent).toBe('false');
    });
    expect(getMeSpy).not.toHaveBeenCalled();
  });

  it('logout limpia todo', async () => {
    setSession({ token: 't1', role: 'OWNER', tenantId: 'tenant-1', email: 'owner@a.com' });
    vi.spyOn(endpoints, 'logout').mockResolvedValue({ ok: true });

    const user = userEvent.setup();
    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    expect(screen.getByTestId('authenticated').textContent).toBe('true');

    await user.click(screen.getByText('logout'));

    await waitFor(() => {
      expect(screen.getByTestId('authenticated').textContent).toBe('false');
    });
  });

  it('un 401 vía el callback de http-client pasa el estado a no-autenticado', async () => {
    setSession({ token: 't1', role: 'OWNER', tenantId: 'tenant-1', email: 'owner@a.com' });

    let registeredCallback: (() => void) | undefined;
    const onUnauthorizedSpy = vi
      .spyOn(httpClient, 'onUnauthorized')
      .mockImplementation((cb: () => void) => {
        registeredCallback = cb;
      });

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    expect(onUnauthorizedSpy).toHaveBeenCalled();
    expect(screen.getByTestId('authenticated').textContent).toBe('true');

    act(() => {
      registeredCallback?.();
    });

    await waitFor(() => {
      expect(screen.getByTestId('authenticated').textContent).toBe('false');
    });
  });

  it('un 401 no crashea ni loguea multiples veces ante llamadas concurrentes', async () => {
    setSession({ token: 't1', role: 'OWNER', tenantId: 'tenant-1', email: 'owner@a.com' });

    let registeredCallback: (() => void) | undefined;
    vi.spyOn(httpClient, 'onUnauthorized').mockImplementation((cb: () => void) => {
      registeredCallback = cb;
    });

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    expect(() => {
      act(() => {
        registeredCallback?.();
        registeredCallback?.();
        registeredCallback?.();
      });
    }).not.toThrow();

    await waitFor(() => {
      expect(screen.getByTestId('authenticated').textContent).toBe('false');
    });
  });
});
