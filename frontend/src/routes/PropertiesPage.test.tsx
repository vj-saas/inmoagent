import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PropertiesPage } from './PropertiesPage';
import { AuthProvider } from '../auth/AuthContext';
import { clearSession, setSession } from '../auth/session-store';
import { onUnauthorized } from '../api/http-client';
import { ConflictError } from '../api/http-client';
import * as endpoints from '../api/endpoints';
import type { ListPropertiesResponse, Property } from '../api/endpoints';

function renderPropertiesPage(): void {
  render(
    <MemoryRouter>
      <AuthProvider>
        <PropertiesPage />
      </AuthProvider>
    </MemoryRouter>,
  );
}

function buildProperty(overrides: Partial<Property> = {}): Property {
  return {
    id: 'prop-1',
    tenantId: 'tenant-1',
    externalRef: null,
    title: 'Depto 2 ambientes en Palermo',
    description: null,
    operation: 'RENT',
    propertyType: 'DEPARTAMENTO',
    status: 'ACTIVE',
    price: '150000',
    currency: 'ARS',
    expenses: null,
    neighborhood: 'Palermo',
    city: null,
    address: null,
    rooms: 2,
    bedrooms: 1,
    bathrooms: 1,
    areaM2: null,
    garage: false,
    petsAllowed: null,
    features: [],
    listingUrl: null,
    photos: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function buildResponse(overrides: Partial<ListPropertiesResponse> = {}): ListPropertiesResponse {
  return {
    items: [buildProperty()],
    total: 1,
    page: 1,
    pageSize: 20,
    ...overrides,
  };
}

describe('PropertiesPage', () => {
  beforeEach(() => {
    clearSession();
    onUnauthorized(() => {});
    setSession({ token: 't1', role: 'OWNER', tenantId: 'tenant-1', email: 'owner@a.com' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    clearSession();
  });

  it('carga inicial llama listProperties con el tenantId correcto', async () => {
    vi.spyOn(endpoints, 'listProperties').mockResolvedValue(buildResponse());

    renderPropertiesPage();

    await waitFor(() =>
      expect(endpoints.listProperties).toHaveBeenCalledWith(
        'tenant-1',
        expect.objectContaining({ page: 1 }),
        't1',
      ),
    );
  });

  it('cambiar un filtro resetea page a 1 y reinvoca listProperties con el patch correcto', async () => {
    vi.spyOn(endpoints, 'listProperties').mockResolvedValue(buildResponse({ total: 100 }));

    renderPropertiesPage();
    await waitFor(() => expect(endpoints.listProperties).toHaveBeenCalledTimes(1));

    const user = userEvent.setup();
    await user.selectOptions(screen.getByTestId('property-filter-status'), 'ACTIVE');

    await waitFor(() =>
      expect(endpoints.listProperties).toHaveBeenLastCalledWith(
        'tenant-1',
        expect.objectContaining({ status: 'ACTIVE', page: 1 }),
        't1',
      ),
    );
  });

  it('cambiar de página preserva el filtro vigente y no lo resetea', async () => {
    vi.spyOn(endpoints, 'listProperties').mockResolvedValue(buildResponse({ total: 100 }));

    renderPropertiesPage();
    await waitFor(() => expect(endpoints.listProperties).toHaveBeenCalledTimes(1));

    const user = userEvent.setup();
    await user.selectOptions(screen.getByTestId('property-filter-operation'), 'RENT');
    await waitFor(() =>
      expect(endpoints.listProperties).toHaveBeenLastCalledWith(
        'tenant-1',
        expect.objectContaining({ operation: 'RENT', page: 1 }),
        't1',
      ),
    );

    await user.click(screen.getByTestId('pagination-next-btn'));

    await waitFor(() =>
      expect(endpoints.listProperties).toHaveBeenLastCalledWith(
        'tenant-1',
        expect.objectContaining({ operation: 'RENT', page: 2 }),
        't1',
      ),
    );
  });

  it('muestra Spinner mientras loading', async () => {
    let resolvePromise: (value: ListPropertiesResponse) => void = () => {};
    vi.spyOn(endpoints, 'listProperties').mockReturnValue(
      new Promise((resolve) => {
        resolvePromise = resolve;
      }),
    );

    renderPropertiesPage();

    expect(await screen.findByTestId('properties-skeleton')).toBeInTheDocument();

    resolvePromise(buildResponse({ items: [], total: 0 }));
    await waitFor(() => expect(screen.queryByTestId('properties-skeleton')).not.toBeInTheDocument());
  });

  it('muestra ErrorBanner si falla la carga', async () => {
    vi.spyOn(endpoints, 'listProperties').mockRejectedValue(new Error('Error de red.'));

    renderPropertiesPage();

    expect(await screen.findByTestId('error-banner')).toHaveTextContent('Error de red.');
    expect(screen.queryByTestId(/property-row-/)).not.toBeInTheDocument();
  });

  it('lista vacía muestra el EmptyState junto a los dos CTAs, sin error', async () => {
    vi.spyOn(endpoints, 'listProperties').mockResolvedValue(buildResponse({ items: [], total: 0 }));

    renderPropertiesPage();

    expect(await screen.findByTestId('properties-empty')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cargar propiedad' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Importar CSV' })).toBeInTheDocument();
    expect(screen.queryByTestId('error-banner')).not.toBeInTheDocument();
  });

  it('con datos, muestra la lista y la paginación sin spinner/error/vacío (estados mutuamente excluyentes)', async () => {
    vi.spyOn(endpoints, 'listProperties').mockResolvedValue(buildResponse());

    renderPropertiesPage();

    expect(await screen.findByTestId('property-row-prop-1')).toBeInTheDocument();
    expect(screen.getByTestId('pagination')).toBeInTheDocument();
    expect(screen.queryByTestId('properties-skeleton')).not.toBeInTheDocument();
    expect(screen.queryByTestId('error-banner')).not.toBeInTheDocument();
    expect(screen.queryByTestId('properties-empty')).not.toBeInTheDocument();
  });

  it('tras un 409 al borrar, la fila sigue en la tabla y se ve el ErrorBanner de DeletePropertyButton', async () => {
    vi.spyOn(endpoints, 'listProperties').mockResolvedValue(buildResponse());
    vi.spyOn(endpoints, 'removeProperty').mockRejectedValue(
      new ConflictError('No se puede borrar: tiene una cita asociada.'),
    );

    renderPropertiesPage();
    await screen.findByTestId('property-row-prop-1');

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Borrar' }));
    await user.click(screen.getByTestId('delete-property-button'));
    await user.click(screen.getByTestId('delete-property-confirm'));

    expect(await screen.findByTestId('error-banner')).toHaveTextContent(
      'No se puede borrar: tiene una cita asociada.',
    );
    expect(screen.getByTestId('property-row-prop-1')).toBeInTheDocument();
    expect(endpoints.listProperties).toHaveBeenCalledTimes(1);
  });

  it('abrir "Cambiar estado" cierra el panel de borrado, y viceversa (sin dos cards a la vez)', async () => {
    vi.spyOn(endpoints, 'listProperties').mockResolvedValue(buildResponse());

    renderPropertiesPage();
    await screen.findByTestId('property-row-prop-1');

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Borrar' }));
    expect(screen.getByTestId('delete-property-button')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Cambiar estado' }));
    expect(screen.queryByTestId('delete-property-button')).not.toBeInTheDocument();
    expect(screen.getByTestId('property-status-control')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Borrar' }));
    expect(screen.getByTestId('delete-property-button')).toBeInTheDocument();
    expect(screen.queryByTestId('property-status-control')).not.toBeInTheDocument();
  });

  it('cerrar el modal de importar CSV dispara un refetch de la lista', async () => {
    vi.spyOn(endpoints, 'listProperties').mockResolvedValue(buildResponse());

    renderPropertiesPage();
    await screen.findByTestId('property-row-prop-1');
    expect(endpoints.listProperties).toHaveBeenCalledTimes(1);

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Importar CSV' }));
    expect(await screen.findByTestId('csv-uploader')).toBeInTheDocument();

    await user.keyboard('{Escape}');

    await waitFor(() => expect(endpoints.listProperties).toHaveBeenCalledTimes(2));
  });
});
