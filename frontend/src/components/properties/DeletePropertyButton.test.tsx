import { beforeEach, describe, it, expect, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import type { Property } from '../../api/endpoints';
import { removeProperty } from '../../api/endpoints';
import { ConflictError } from '../../api/http-client';
import { DeletePropertyButton } from './DeletePropertyButton';

vi.mock('../../api/endpoints', () => ({
  removeProperty: vi.fn(),
}));

describe('DeletePropertyButton Component', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  const mockRemoveProperty = removeProperty as unknown as ReturnType<typeof vi.fn>;

  const mockProperty: Property = {
    id: 'property-1',
    tenantId: 'tenant-1',
    externalRef: null,
    title: 'Depto 2 ambientes en Palermo',
    description: null,
    operation: 'SALE',
    propertyType: 'APARTMENT',
    status: 'ACTIVE',
    price: '150000',
    currency: 'USD',
    expenses: null,
    neighborhood: 'Palermo',
    city: null,
    address: null,
    rooms: 2,
    bedrooms: 1,
    bathrooms: 1,
    areaM2: 50,
    garage: false,
    petsAllowed: null,
    features: [],
    listingUrl: null,
    photos: [],
    createdAt: '2026-07-24T09:00:00Z',
    updatedAt: '2026-07-24T09:00:00Z',
  };

  it('se renderiza con el botón "Eliminar"', () => {
    const onDeleted = vi.fn();
    render(
      <DeletePropertyButton
        property={mockProperty}
        tenantId="tenant-1"
        token="tok"
        onDeleted={onDeleted}
      />,
    );

    expect(screen.getByTestId('delete-property-button')).toBeInTheDocument();
    expect(screen.getByTestId('delete-property-button')).toHaveTextContent('Eliminar');
  });

  it('el click en el botón principal abre el modal sin invocar removeProperty', () => {
    const onDeleted = vi.fn();
    render(
      <DeletePropertyButton
        property={mockProperty}
        tenantId="tenant-1"
        token="tok"
        onDeleted={onDeleted}
      />,
    );

    expect(screen.queryByTestId('delete-property-modal')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('delete-property-button'));

    expect(screen.getByTestId('delete-property-modal')).toBeInTheDocument();
    expect(mockRemoveProperty).not.toHaveBeenCalled();
  });

  it('cancelar en el modal cierra el modal sin invocar removeProperty', () => {
    const onDeleted = vi.fn();
    render(
      <DeletePropertyButton
        property={mockProperty}
        tenantId="tenant-1"
        token="tok"
        onDeleted={onDeleted}
      />,
    );

    fireEvent.click(screen.getByTestId('delete-property-button'));
    expect(screen.getByTestId('delete-property-modal')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('delete-property-cancel'));

    expect(screen.queryByTestId('delete-property-modal')).not.toBeInTheDocument();
    expect(mockRemoveProperty).not.toHaveBeenCalled();
    expect(onDeleted).not.toHaveBeenCalled();
  });

  it('invoca removeProperty solo al confirmar en el modal, y luego onDeleted si tiene éxito', async () => {
    mockRemoveProperty.mockResolvedValue({ deleted: true });

    const onDeleted = vi.fn();
    render(
      <DeletePropertyButton
        property={mockProperty}
        tenantId="tenant-1"
        token="tok"
        onDeleted={onDeleted}
      />,
    );

    fireEvent.click(screen.getByTestId('delete-property-button'));
    expect(mockRemoveProperty).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('delete-property-confirm'));

    await waitFor(() => {
      expect(onDeleted).toHaveBeenCalled();
    });

    expect(mockRemoveProperty).toHaveBeenCalledWith('tenant-1', 'property-1', 'tok');
  });

  it('deshabilita el botón de confirmar mientras está cargando', async () => {
    mockRemoveProperty.mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => resolve({ deleted: true }), 100);
        }),
    );

    const onDeleted = vi.fn();
    render(
      <DeletePropertyButton
        property={mockProperty}
        tenantId="tenant-1"
        token="tok"
        onDeleted={onDeleted}
      />,
    );

    fireEvent.click(screen.getByTestId('delete-property-button'));
    const confirmButton = screen.getByTestId('delete-property-confirm');
    fireEvent.click(confirmButton);

    expect(confirmButton).toBeDisabled();
    expect(confirmButton).toHaveTextContent('Eliminando...');

    await waitFor(() => {
      expect(onDeleted).toHaveBeenCalled();
    });
  });

  it('ante 409 (propiedad con Appointment asociado) muestra el mensaje del backend, no invoca onDeleted, y la fila no se quita (el modal sigue abierto)', async () => {
    mockRemoveProperty.mockRejectedValue(
      new ConflictError('No se puede eliminar: la propiedad tiene citas asociadas.'),
    );

    const onDeleted = vi.fn();
    render(
      <DeletePropertyButton
        property={mockProperty}
        tenantId="tenant-1"
        token="tok"
        onDeleted={onDeleted}
      />,
    );

    fireEvent.click(screen.getByTestId('delete-property-button'));
    fireEvent.click(screen.getByTestId('delete-property-confirm'));

    await waitFor(() => {
      expect(screen.getByTestId('error-banner')).toBeInTheDocument();
    });

    expect(screen.getByTestId('error-banner')).toHaveTextContent(
      'No se puede eliminar: la propiedad tiene citas asociadas.',
    );
    expect(onDeleted).not.toHaveBeenCalled();
    expect(screen.getByTestId('delete-property-modal')).toBeInTheDocument();
  });
});
