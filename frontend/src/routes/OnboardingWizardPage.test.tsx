import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OnboardingWizardPage } from './OnboardingWizardPage';
import * as endpoints from '../api/endpoints';

async function fillTenantCreateForm(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.type(screen.getByLabelText(/master key/i), 'mk-1');
  await user.type(screen.getByLabelText(/^nombre$/i), 'Inmobiliaria Test');
  await user.type(screen.getByLabelText(/^slug$/i), 'inmo-test');
  await user.type(screen.getByLabelText(/phone number id/i), '123456789');
  await user.type(screen.getByLabelText(/access token/i), 'secret-token');
  await user.type(screen.getByLabelText(/email del owner/i), 'owner@inmo.com');
  await user.type(screen.getByLabelText(/contraseña del owner/i), 'password123');
  await user.click(screen.getByRole('button', { name: /crear tenant/i }));
}

describe('OnboardingWizardPage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('avanza de paso en paso completando cada uno exitosamente', async () => {
    vi.spyOn(endpoints, 'createTenant').mockResolvedValue({
      tenantId: 'tenant-1',
      apiKey: 'api-key-abc',
    });
    vi.spyOn(endpoints, 'bootstrapOwner').mockResolvedValue({
      id: 'person-1',
      tenantId: 'tenant-1',
      email: 'owner@inmo.com',
      role: 'OWNER',
      active: true,
    });
    vi.spyOn(endpoints, 'login').mockResolvedValue({ token: 'session-token-1' });
    vi.spyOn(endpoints, 'getWebhookStatus').mockResolvedValue({
      connected: false,
      lastEventAt: null,
      lastMessageAt: null,
    });
    vi.spyOn(endpoints, 'listProperties').mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      pageSize: 20,
    });

    const user = userEvent.setup();
    render(<OnboardingWizardPage />);

    expect(screen.getByTestId('wizard-step-1')).toHaveAttribute('aria-current', 'step');

    await fillTenantCreateForm(user);

    expect(await screen.findByTestId('api-key-reveal')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /continuar/i }));

    expect(screen.getByTestId('wizard-step-2')).toHaveAttribute('aria-current', 'step');
    expect(screen.getByTestId('meta-setup-guide')).toBeInTheDocument();
    expect(screen.getByTestId('csv-uploader')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /continuar/i }));

    expect(screen.getByTestId('wizard-step-3')).toHaveAttribute('aria-current', 'step');
    expect(await screen.findByTestId('webhook-status-card')).toBeInTheDocument();
  });

  it('reintenta un paso fallido sin repetir la creación del tenant', async () => {
    vi.spyOn(endpoints, 'createTenant').mockResolvedValue({
      tenantId: 'tenant-1',
      apiKey: 'api-key-abc',
    });
    const bootstrapSpy = vi
      .spyOn(endpoints, 'bootstrapOwner')
      .mockRejectedValueOnce(new Error('El servidor no respondió.'))
      .mockResolvedValueOnce({
        id: 'person-1',
        tenantId: 'tenant-1',
        email: 'owner@inmo.com',
        role: 'OWNER',
        active: true,
      });
    vi.spyOn(endpoints, 'login').mockResolvedValue({ token: 'session-token-1' });

    const user = userEvent.setup();
    render(<OnboardingWizardPage />);

    await fillTenantCreateForm(user);

    expect(await screen.findByRole('button', { name: /reintentar/i })).toBeInTheDocument();
    expect(endpoints.createTenant).toHaveBeenCalledTimes(1);
    expect(bootstrapSpy).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: /reintentar/i }));

    expect(await screen.findByTestId('api-key-reveal')).toBeInTheDocument();
    expect(endpoints.createTenant).toHaveBeenCalledTimes(1);
    expect(bootstrapSpy).toHaveBeenCalledTimes(2);
  });

  it('nunca escribe la master key en sessionStorage a lo largo de todo el flujo', async () => {
    vi.spyOn(endpoints, 'createTenant').mockResolvedValue({
      tenantId: 'tenant-1',
      apiKey: 'api-key-abc',
    });
    vi.spyOn(endpoints, 'bootstrapOwner').mockResolvedValue({
      id: 'person-1',
      tenantId: 'tenant-1',
      email: 'owner@inmo.com',
      role: 'OWNER',
      active: true,
    });
    vi.spyOn(endpoints, 'login').mockResolvedValue({ token: 'session-token-1' });
    vi.spyOn(endpoints, 'getWebhookStatus').mockResolvedValue({
      connected: false,
      lastEventAt: null,
      lastMessageAt: null,
    });
    vi.spyOn(endpoints, 'listProperties').mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      pageSize: 20,
    });

    const setItemSpy = vi.spyOn(window.sessionStorage, 'setItem');

    const user = userEvent.setup();
    render(<OnboardingWizardPage />);

    await fillTenantCreateForm(user);
    expect(await screen.findByTestId('api-key-reveal')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /continuar/i }));

    await user.click(screen.getByRole('button', { name: /continuar/i }));
    await screen.findByTestId('webhook-status-card');

    for (const call of setItemSpy.mock.calls) {
      const [key, value] = call;
      expect(String(key).toLowerCase()).not.toContain('master');
      expect(String(value)).not.toContain('mk-1');
    }
  });

  it('el input de master key nunca persiste en localStorage/sessionStorage vía session-store', async () => {
    vi.spyOn(endpoints, 'createTenant').mockResolvedValue({
      tenantId: 'tenant-1',
      apiKey: 'api-key-abc',
    });
    vi.spyOn(endpoints, 'bootstrapOwner').mockResolvedValue({
      id: 'person-1',
      tenantId: 'tenant-1',
      email: 'owner@inmo.com',
      role: 'OWNER',
      active: true,
    });
    vi.spyOn(endpoints, 'login').mockResolvedValue({ token: 'session-token-1' });

    const user = userEvent.setup();
    render(<OnboardingWizardPage />);

    await fillTenantCreateForm(user);
    await waitFor(() => expect(screen.getByTestId('api-key-reveal')).toBeInTheDocument());

    expect(window.sessionStorage.getItem('agente-inmo:session')).toBeNull();
  });
});
