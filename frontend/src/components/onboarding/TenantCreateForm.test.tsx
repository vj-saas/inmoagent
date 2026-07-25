import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TenantCreateForm } from './TenantCreateForm';
import * as endpoints from '../../api/endpoints';
import { ConflictError } from '../../api/http-client';

describe('TenantCreateForm', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('accessToken es un input type=password', () => {
    render(<TenantCreateForm masterKey="mk-1" onSuccess={() => {}} />);

    const input = screen.getByLabelText(/access token/i);
    expect(input).toHaveAttribute('type', 'password');
  });

  it('completa campos mínimos y en submit exitoso llama a createTenant con el DTO correcto', async () => {
    const createTenantSpy = vi.spyOn(endpoints, 'createTenant').mockResolvedValue({
      tenantId: 'tenant-1',
      apiKey: 'api-key-abc',
    });
    const onSuccess = vi.fn();

    render(<TenantCreateForm masterKey="mk-1" onSuccess={onSuccess} />);

    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/^nombre$/i), 'Inmobiliaria Test');
    await user.type(screen.getByLabelText(/^slug$/i), 'inmo-test');
    await user.type(screen.getByLabelText(/phone number id/i), '123456789');
    await user.type(screen.getByLabelText(/access token/i), 'secret-token');
    await user.type(screen.getByLabelText(/email del owner/i), 'owner@inmo.com');
    await user.type(screen.getByLabelText(/contraseña del owner/i), 'password123');

    await user.click(screen.getByRole('button', { name: /crear tenant/i }));

    expect(createTenantSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Inmobiliaria Test',
        slug: 'inmo-test',
        phoneNumberId: '123456789',
        accessToken: 'secret-token',
      }),
      'mk-1',
    );

    expect(onSuccess).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      apiKey: 'api-key-abc',
      ownerEmail: 'owner@inmo.com',
      ownerPassword: 'password123',
    });
  });

  it('ConflictError de slug se muestra como error de campo, sin excepción no manejada', async () => {
    vi.spyOn(endpoints, 'createTenant').mockRejectedValue(
      new ConflictError('Ya existe un tenant con ese slug.'),
    );
    const onSuccess = vi.fn();

    render(<TenantCreateForm masterKey="mk-1" onSuccess={onSuccess} />);

    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/^nombre$/i), 'Inmobiliaria Test');
    await user.type(screen.getByLabelText(/^slug$/i), 'inmo-test');
    await user.type(screen.getByLabelText(/phone number id/i), '123456789');
    await user.type(screen.getByLabelText(/access token/i), 'secret-token');
    await user.type(screen.getByLabelText(/email del owner/i), 'owner@inmo.com');
    await user.type(screen.getByLabelText(/contraseña del owner/i), 'password123');

    await user.click(screen.getByRole('button', { name: /crear tenant/i }));

    expect(await screen.findByText('Ya existe un tenant con ese slug.')).toBeInTheDocument();
    expect(onSuccess).not.toHaveBeenCalled();
    // No es un banner genérico de página, sino texto asociado al campo slug.
    expect(screen.queryByTestId('error-banner')).not.toBeInTheDocument();
  });

  it('ConflictError sin substring reconocible se muestra como error general del formulario', async () => {
    vi.spyOn(endpoints, 'createTenant').mockRejectedValue(
      new ConflictError('Conflicto al crear el tenant.'),
    );

    render(<TenantCreateForm masterKey="mk-1" onSuccess={() => {}} />);

    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/^nombre$/i), 'Inmobiliaria Test');
    await user.type(screen.getByLabelText(/^slug$/i), 'inmo-test');
    await user.type(screen.getByLabelText(/phone number id/i), '123456789');
    await user.type(screen.getByLabelText(/access token/i), 'secret-token');
    await user.type(screen.getByLabelText(/email del owner/i), 'owner@inmo.com');
    await user.type(screen.getByLabelText(/contraseña del owner/i), 'password123');

    await user.click(screen.getByRole('button', { name: /crear tenant/i }));

    expect(await screen.findByTestId('error-banner')).toHaveTextContent(
      'Conflicto al crear el tenant.',
    );
  });
});
