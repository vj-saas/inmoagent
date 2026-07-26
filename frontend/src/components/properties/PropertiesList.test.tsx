import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Property } from '../../api/endpoints';
import { PropertiesList } from './PropertiesList';

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

describe('PropertiesList', () => {
  it('renderiza una fila por propiedad con los datos correctos', () => {
    const property = buildProperty();

    render(
      <PropertiesList
        items={[property]}
        onEdit={vi.fn()}
        onChangeStatus={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    const row = screen.getByTestId('property-row-prop-1');
    expect(within(row).getByText('Depto 2 ambientes en Palermo')).toBeInTheDocument();
    expect(within(row).getByText('Alquiler')).toBeInTheDocument();
    expect(within(row).getByText('ARS 150000')).toBeInTheDocument();
    expect(within(row).getByText('Palermo')).toBeInTheDocument();
    expect(within(row).getByText('Activa')).toBeInTheDocument();
    expect(within(row).getByText('2')).toBeInTheDocument();
  });

  it('muestra un guion cuando rooms es null', () => {
    const property = buildProperty({ id: 'prop-2', rooms: null });

    render(
      <PropertiesList
        items={[property]}
        onEdit={vi.fn()}
        onChangeStatus={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    const row = screen.getByTestId('property-row-prop-2');
    expect(within(row).getByText('—')).toBeInTheDocument();
  });

  it('dispara onEdit con la propiedad al clickear Editar', async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    const property = buildProperty();

    render(
      <PropertiesList
        items={[property]}
        onEdit={onEdit}
        onChangeStatus={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Editar' }));
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onEdit).toHaveBeenCalledWith(property);
  });

  it('dispara onChangeStatus con la propiedad al clickear Cambiar estado', async () => {
    const user = userEvent.setup();
    const onChangeStatus = vi.fn();
    const property = buildProperty();

    render(
      <PropertiesList
        items={[property]}
        onEdit={vi.fn()}
        onChangeStatus={onChangeStatus}
        onDelete={vi.fn()}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Cambiar estado' }));
    expect(onChangeStatus).toHaveBeenCalledTimes(1);
    expect(onChangeStatus).toHaveBeenCalledWith(property);
  });

  it('dispara onDelete con la propiedad al clickear Borrar', async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    const property = buildProperty();

    render(
      <PropertiesList
        items={[property]}
        onEdit={vi.fn()}
        onChangeStatus={vi.fn()}
        onDelete={onDelete}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Borrar' }));
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledWith(property);
  });

  it('renderiza cero filas cuando items está vacío', () => {
    render(
      <PropertiesList items={[]} onEdit={vi.fn()} onChangeStatus={vi.fn()} onDelete={vi.fn()} />
    );

    expect(screen.getByText('Título')).toBeInTheDocument(); // header sigue presente
    expect(screen.queryAllByTestId(/property-row-/)).toHaveLength(0);
  });
});
