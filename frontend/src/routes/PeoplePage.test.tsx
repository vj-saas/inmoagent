import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PeoplePage } from './PeoplePage';
import { AuthProvider } from '../auth/AuthContext';
import { clearSession, setSession } from '../auth/session-store';
import { onUnauthorized, ForbiddenError } from '../api/http-client';
import * as endpoints from '../api/endpoints';

function renderPeoplePage(): void {
  render(
    <AuthProvider>
      <PeoplePage />
    </AuthProvider>,
  );
}

describe('PeoplePage', () => {
  beforeEach(() => {
    clearSession();
    onUnauthorized(() => {});
    setSession({ token: 't1', role: 'OWNER', tenantId: 'tenant-1', email: 'owner@a.com' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    clearSession();
  });

  it('lista las personas devueltas por listPeople tal cual, sin inventar campos', async () => {
    vi.spyOn(endpoints, 'listPeople').mockResolvedValue({
      people: [
        { id: 'p1', tenantId: 'tenant-1', email: 'agente1@a.com', role: 'AGENT', active: true },
        { id: 'p2', tenantId: 'tenant-1', email: 'agente2@a.com', role: 'OWNER', active: false },
      ],
    });

    renderPeoplePage();

    expect(await screen.findByText('agente1@a.com')).toBeInTheDocument();
    expect(screen.getByText('agente2@a.com')).toBeInTheDocument();
    // No inventa campos: solo dos filas, ni más ni menos.
    expect(screen.getAllByRole('row')).toHaveLength(3); // header + 2 filas
  });

  it('crear con éxito y temporaryPassword muestra el modal efímero', async () => {
    vi.spyOn(endpoints, 'listPeople').mockResolvedValue({ people: [] });
    vi.spyOn(endpoints, 'createPerson').mockResolvedValue({
      id: 'p3',
      tenantId: 'tenant-1',
      email: 'nuevo@a.com',
      role: 'AGENT',
      active: true,
      temporaryPassword: 'temp-pass-123',
    });

    renderPeoplePage();
    await waitFor(() => expect(endpoints.listPeople).toHaveBeenCalled());

    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/email/i), 'nuevo@a.com');
    await user.click(screen.getByRole('button', { name: /crear/i }));

    expect(await screen.findByTestId('temporary-password-modal')).toBeInTheDocument();
    expect(screen.getByText('temp-pass-123')).toBeInTheDocument();
  });

  it('crear con 409 muestra el error sin agregar fila local', async () => {
    vi.spyOn(endpoints, 'listPeople').mockResolvedValue({ people: [] });
    vi.spyOn(endpoints, 'createPerson').mockRejectedValue(
      new Error('Ya existe una persona con ese email.'),
    );

    renderPeoplePage();
    await waitFor(() => expect(endpoints.listPeople).toHaveBeenCalled());

    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/email/i), 'duplicado@a.com');
    await user.click(screen.getByRole('button', { name: /crear/i }));

    expect(await screen.findByTestId('error-banner')).toHaveTextContent(
      'Ya existe una persona con ese email.',
    );
    expect(screen.queryByText('duplicado@a.com')).not.toBeInTheDocument();
    expect(screen.queryByTestId('temporary-password-modal')).not.toBeInTheDocument();
  });

  it('crear con 409 real del backend (fetch mockeado, sin mockear createPerson) muestra el motivo real', async () => {
    vi.spyOn(endpoints, 'listPeople').mockResolvedValue({ people: [] });

    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({
        statusCode: 409,
        message: 'Ya existe una persona con ese email.',
        error: 'Conflict',
      }),
    } as Response);
    vi.stubGlobal('fetch', fetchMock);

    renderPeoplePage();
    await waitFor(() => expect(endpoints.listPeople).toHaveBeenCalled());

    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/email/i), 'duplicado@a.com');
    await user.click(screen.getByRole('button', { name: /crear/i }));

    // Este es el camino real end-to-end: http-client.request -> ConflictError
    // con el mensaje real del backend, sin mockear endpoints.createPerson.
    expect(await screen.findByTestId('error-banner')).toHaveTextContent(
      'Ya existe una persona con ese email.',
    );
    expect(screen.queryByText('duplicado@a.com')).not.toBeInTheDocument();

    vi.unstubAllGlobals();
  });

  it('acceso con 403 muestra mensaje de permisos sin datos de otras personas', async () => {
    vi.spyOn(endpoints, 'listPeople').mockRejectedValue(new ForbiddenError());

    renderPeoplePage();

    expect(await screen.findByTestId('error-banner')).toHaveTextContent(
      'No tenés permisos para acceder a la gestión de personas.',
    );
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});
