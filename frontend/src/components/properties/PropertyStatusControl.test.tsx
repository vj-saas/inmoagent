import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PropertyStatusControl } from './PropertyStatusControl';
import * as endpoints from '../../api/endpoints';
import type { Property } from '../../api/endpoints';

function buildProperty(overrides: Partial<Property> = {}): Property {
  return {
    id: 'property-1',
    tenantId: 'tenant-1',
    externalRef: null,
    title: 'Depto 2 ambientes',
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
    areaM2: 45,
    garage: false,
    petsAllowed: null,
    features: [],
    listingUrl: null,
    photos: [],
    createdAt: '2026-07-24T00:00:00.000Z',
    updatedAt: '2026-07-24T00:00:00.000Z',
    ...overrides,
  };
}

describe('PropertyStatusControl Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('el selector muestra las 4 opciones del enum real', () => {
    const property = buildProperty();
    render(
      <PropertyStatusControl
        property={property}
        tenantId="tenant-1"
        token="token-1"
        onUpdated={vi.fn()}
      />,
    );

    const select = screen.getByTestId('property-status-control-select') as HTMLSelectElement;
    const options = Array.from(select.options).map((o) => o.value);
    expect(options).toEqual(['ACTIVE', 'PAUSED', 'RESERVED', 'SOLD_OR_RENTED']);
  });

  it('muestra el copy sobre no retirar fichas ya enviadas', () => {
    const property = buildProperty();
    render(
      <PropertyStatusControl
        property={property}
        tenantId="tenant-1"
        token="token-1"
        onUpdated={vi.fn()}
      />,
    );

    expect(
      screen.getByText(/no retira las fichas ya enviadas en conversaciones en curso/i),
    ).toBeInTheDocument();
  });

  it('el botón de guardar arranca deshabilitado si no se cambió el estado', () => {
    const property = buildProperty({ status: 'ACTIVE' });
    render(
      <PropertyStatusControl
        property={property}
        tenantId="tenant-1"
        token="token-1"
        onUpdated={vi.fn()}
      />,
    );

    expect(screen.getByTestId('property-status-control-save')).toBeDisabled();
  });

  it('elegir RESERVED y guardar llama a updatePropertyStatus con ese valor', async () => {
    const property = buildProperty({ status: 'ACTIVE' });
    const updated = buildProperty({ status: 'RESERVED' });
    vi.spyOn(endpoints, 'updatePropertyStatus').mockResolvedValue(updated);

    render(
      <PropertyStatusControl
        property={property}
        tenantId="tenant-1"
        token="token-1"
        onUpdated={vi.fn()}
      />,
    );

    const user = userEvent.setup();
    await user.selectOptions(
      screen.getByTestId('property-status-control-select'),
      'RESERVED',
    );
    await user.click(screen.getByTestId('property-status-control-save'));

    await waitFor(() =>
      expect(endpoints.updatePropertyStatus).toHaveBeenCalledWith(
        'tenant-1',
        'property-1',
        'RESERVED',
        'token-1',
      ),
    );
  });

  it('elegir SOLD_OR_RENTED y guardar llama a updatePropertyStatus con ese valor', async () => {
    const property = buildProperty({ status: 'ACTIVE' });
    const updated = buildProperty({ status: 'SOLD_OR_RENTED' });
    vi.spyOn(endpoints, 'updatePropertyStatus').mockResolvedValue(updated);

    render(
      <PropertyStatusControl
        property={property}
        tenantId="tenant-1"
        token="token-1"
        onUpdated={vi.fn()}
      />,
    );

    const user = userEvent.setup();
    await user.selectOptions(
      screen.getByTestId('property-status-control-select'),
      'SOLD_OR_RENTED',
    );
    await user.click(screen.getByTestId('property-status-control-save'));

    await waitFor(() =>
      expect(endpoints.updatePropertyStatus).toHaveBeenCalledWith(
        'tenant-1',
        'property-1',
        'SOLD_OR_RENTED',
        'token-1',
      ),
    );
  });

  it('invoca onUpdated con la propiedad devuelta por el PATCH exitoso', async () => {
    const property = buildProperty({ status: 'ACTIVE' });
    const updated = buildProperty({ status: 'PAUSED' });
    const onUpdated = vi.fn();
    vi.spyOn(endpoints, 'updatePropertyStatus').mockResolvedValue(updated);

    render(
      <PropertyStatusControl
        property={property}
        tenantId="tenant-1"
        token="token-1"
        onUpdated={onUpdated}
      />,
    );

    const user = userEvent.setup();
    await user.selectOptions(screen.getByTestId('property-status-control-select'), 'PAUSED');
    await user.click(screen.getByTestId('property-status-control-save'));

    await waitFor(() => expect(onUpdated).toHaveBeenCalledWith(updated));
  });

  it('un error del backend se muestra sin crashear y sin perder la selección', async () => {
    const property = buildProperty({ status: 'ACTIVE' });
    const onUpdated = vi.fn();
    vi.spyOn(endpoints, 'updatePropertyStatus').mockRejectedValue(new Error('Bad Request'));

    render(
      <PropertyStatusControl
        property={property}
        tenantId="tenant-1"
        token="token-1"
        onUpdated={onUpdated}
      />,
    );

    const user = userEvent.setup();
    await user.selectOptions(screen.getByTestId('property-status-control-select'), 'PAUSED');
    await user.click(screen.getByTestId('property-status-control-save'));

    expect(await screen.findByTestId('property-status-control-error')).toBeInTheDocument();
    expect(onUpdated).not.toHaveBeenCalled();

    const select = screen.getByTestId('property-status-control-select') as HTMLSelectElement;
    expect(select.value).toBe('PAUSED');
  });
});
