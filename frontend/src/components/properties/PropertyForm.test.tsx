import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { PropertyForm } from './PropertyForm';
import {
  createProperty,
  updateProperty,
  type Property,
} from '../../api/endpoints';
import { ConflictError, ValidationError } from '../../api/http-client';

vi.mock('../../api/endpoints', async () => {
  const actual = await vi.importActual<typeof import('../../api/endpoints')>(
    '../../api/endpoints',
  );
  return {
    ...actual,
    createProperty: vi.fn(),
    updateProperty: vi.fn(),
    uploadPropertyPhoto: vi.fn(),
  };
});

const mockedCreate = vi.mocked(createProperty);
const mockedUpdate = vi.mocked(updateProperty);

const TENANT_ID = 'tenant-1';
const TOKEN = 'token-abc';

function buildProperty(overrides: Partial<Property> = {}): Property {
  return {
    id: 'prop-1',
    tenantId: TENANT_ID,
    externalRef: null,
    title: 'Depto en Palermo',
    description: null,
    operation: 'SALE',
    propertyType: 'Departamento',
    status: 'ACTIVE',
    price: '150000',
    currency: 'USD',
    expenses: null,
    neighborhood: 'Palermo',
    city: null,
    address: null,
    rooms: null,
    bedrooms: null,
    bathrooms: null,
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

describe('PropertyForm', () => {
  beforeEach(() => {
    mockedCreate.mockReset();
    mockedUpdate.mockReset();
  });

  it('no envía el alta si faltan campos obligatorios', async () => {
    const user = userEvent.setup();
    render(<PropertyForm tenantId={TENANT_ID} token={TOKEN} />);

    await user.click(screen.getByRole('button', { name: /cargar propiedad/i }));

    expect(mockedCreate).not.toHaveBeenCalled();
    expect(screen.getByText(/el título es obligatorio/i)).toBeInTheDocument();
    expect(screen.getByText(/la operación es obligatoria/i)).toBeInTheDocument();
    expect(screen.getByText(/el tipo de propiedad es obligatorio/i)).toBeInTheDocument();
    expect(screen.getByText(/el precio es obligatorio/i)).toBeInTheDocument();
    expect(screen.getByText(/el barrio es obligatorio/i)).toBeInTheDocument();
  });

  it('crea la propiedad con createProperty al completar los campos obligatorios', async () => {
    const user = userEvent.setup();
    const created = buildProperty();
    mockedCreate.mockResolvedValue(created);
    const onSaved = vi.fn();

    render(<PropertyForm tenantId={TENANT_ID} token={TOKEN} onSaved={onSaved} />);

    await user.type(screen.getByLabelText(/título/i), 'Depto en Palermo');
    await user.selectOptions(screen.getByLabelText(/operación/i), 'SALE');
    await user.type(screen.getByLabelText(/tipo de propiedad/i), 'Departamento');
    await user.type(screen.getByLabelText(/precio/i), '150000');
    await user.type(screen.getByLabelText(/barrio/i), 'Palermo');

    await user.click(screen.getByRole('button', { name: /cargar propiedad/i }));

    await waitFor(() => expect(mockedCreate).toHaveBeenCalledTimes(1));
    expect(mockedCreate).toHaveBeenCalledWith(
      TENANT_ID,
      expect.objectContaining({
        title: 'Depto en Palermo',
        operation: 'SALE',
        propertyType: 'Departamento',
        price: 150000,
        neighborhood: 'Palermo',
      }),
      TOKEN,
    );
    expect(onSaved).toHaveBeenCalledWith(created);
  });

  it('en edición envía solo los campos que el usuario tocó (PATCH parcial)', async () => {
    const user = userEvent.setup();
    const existing = buildProperty({ price: '150000', neighborhood: 'Palermo' });
    const updated = buildProperty({ price: '160000' });
    mockedUpdate.mockResolvedValue(updated);

    render(<PropertyForm tenantId={TENANT_ID} token={TOKEN} property={existing} />);

    const priceInput = screen.getByLabelText(/precio/i);
    await user.clear(priceInput);
    await user.type(priceInput, '160000');

    await user.click(screen.getByRole('button', { name: /guardar cambios/i }));

    await waitFor(() => expect(mockedUpdate).toHaveBeenCalledTimes(1));
    const [, propertyId, dto, token] = mockedUpdate.mock.calls[0];
    expect(propertyId).toBe(existing.id);
    expect(token).toBe(TOKEN);
    expect(dto).toEqual({ price: 160000 });
  });

  it('ante un 400 muestra el motivo del backend en el campo precio y no crea la propiedad', async () => {
    const user = userEvent.setup();
    mockedCreate.mockRejectedValue(
      new ValidationError([], 'price must be a positive number'),
    );

    render(<PropertyForm tenantId={TENANT_ID} token={TOKEN} />);

    await user.type(screen.getByLabelText(/título/i), 'Depto en Palermo');
    await user.selectOptions(screen.getByLabelText(/operación/i), 'SALE');
    await user.type(screen.getByLabelText(/tipo de propiedad/i), 'Departamento');
    await user.type(screen.getByLabelText(/precio/i), '-5');
    await user.type(screen.getByLabelText(/barrio/i), 'Palermo');

    await user.click(screen.getByRole('button', { name: /cargar propiedad/i }));

    await waitFor(() =>
      expect(screen.getByTestId('property-form-price-error')).toHaveTextContent(
        'price must be a positive number',
      ),
    );
    expect(mockedCreate).toHaveBeenCalledTimes(1);
  });

  it('ante un 409 de externalRef duplicado lo muestra como error del campo correspondiente', async () => {
    const user = userEvent.setup();
    mockedCreate.mockRejectedValue(
      new ConflictError('Ya existe una propiedad con ese externalRef para este tenant'),
    );

    render(<PropertyForm tenantId={TENANT_ID} token={TOKEN} />);

    await user.type(screen.getByLabelText(/título/i), 'Depto en Palermo');
    await user.selectOptions(screen.getByLabelText(/operación/i), 'SALE');
    await user.type(screen.getByLabelText(/tipo de propiedad/i), 'Departamento');
    await user.type(screen.getByLabelText(/precio/i), '150000');
    await user.type(screen.getByLabelText(/barrio/i), 'Palermo');
    await user.type(screen.getByLabelText(/referencia externa/i), 'REF-1');

    await user.click(screen.getByRole('button', { name: /cargar propiedad/i }));

    await waitFor(() =>
      expect(screen.getByTestId('property-form-external-ref-error')).toHaveTextContent(
        'Ya existe una propiedad con ese externalRef para este tenant',
      ),
    );
    expect(screen.queryByTestId('error-banner')).not.toBeInTheDocument();
  });
});
