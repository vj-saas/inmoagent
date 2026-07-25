import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TenantConfigPage } from './TenantConfigPage';
import { AuthProvider } from '../auth/AuthContext';
import { clearSession, setSession } from '../auth/session-store';
import { onUnauthorized } from '../api/http-client';
import * as endpoints from '../api/endpoints';
import type { TenantConfigResponse, WebhookStatusResponse } from '../api/endpoints';

function renderTenantConfigPage(): void {
  render(
    <MemoryRouter>
      <AuthProvider>
        <TenantConfigPage />
      </AuthProvider>
    </MemoryRouter>,
  );
}

function buildWebhookStatus(
  overrides: Partial<WebhookStatusResponse> = {},
): WebhookStatusResponse {
  return {
    connected: false,
    lastEventAt: null,
    lastMessageAt: null,
    ...overrides,
  };
}

function buildConfig(overrides: Partial<TenantConfigResponse> = {}): TenantConfigResponse {
  return {
    id: 'tenant-1',
    name: 'Inmobiliaria Test',
    slug: 'inmobiliaria-test',
    active: true,
    phoneNumberId: 'phone-1',
    wabaId: null,
    displayPhone: null,
    botName: 'Bot',
    botTone: 'amable',
    schedulingLink: null,
    humanHours: null,
    competitorsToAvoid: [],
    coverageAreas: [],
    privacyNoticeSent: true,
    welcomeIntro: null,
    handoffIntro: null,
    alertPhone: null,
    alertsEnabled: false,
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('TenantConfigPage', () => {
  beforeEach(() => {
    clearSession();
    onUnauthorized(() => {});
    setSession({ token: 't1', role: 'OWNER', tenantId: 'tenant-1', email: 'owner@a.com' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    clearSession();
  });

  it('renderiza TenantConfigForm y WebhookStatusCard con el tenantId de la sesión', async () => {
    vi.spyOn(endpoints, 'getWebhookStatus').mockResolvedValue(buildWebhookStatus());

    renderTenantConfigPage();

    expect(screen.getByRole('heading', { level: 1, name: 'Configuración' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /guardar configuración/i })).toBeInTheDocument();
    await waitFor(() => {
      expect(endpoints.getWebhookStatus).toHaveBeenCalledWith('tenant-1', 't1');
    });
    expect(await screen.findByTestId('webhook-status-card')).toBeInTheDocument();
  });

  it('el form arranca sin datos previos (sin GET de config) y se completa recién tras guardar', async () => {
    vi.spyOn(endpoints, 'getWebhookStatus').mockResolvedValue(buildWebhookStatus());
    const saved = buildConfig({ botName: 'Asistente Guardado' });
    vi.spyOn(endpoints, 'updateTenantConfig').mockResolvedValue(saved);

    renderTenantConfigPage();

    const botNameInput = screen.getByLabelText(/nombre del bot/i) as HTMLInputElement;
    expect(botNameInput.value).toBe('');

    const user = userEvent.setup();
    await user.type(botNameInput, 'Nuevo nombre');
    await user.click(screen.getByRole('button', { name: /guardar configuración/i }));

    await waitFor(() => {
      expect(endpoints.updateTenantConfig).toHaveBeenCalledWith(
        'tenant-1',
        { botName: 'Nuevo nombre' },
        't1',
      );
    });

    await waitFor(() => {
      expect((screen.getByLabelText(/nombre del bot/i) as HTMLInputElement).value).toBe(
        'Asistente Guardado',
      );
    });
  });
});
