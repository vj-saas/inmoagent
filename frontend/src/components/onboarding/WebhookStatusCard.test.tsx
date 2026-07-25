import { beforeEach, describe, it, expect, vi } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { getWebhookStatus } from '../../api/endpoints';
import { WebhookStatusCard } from './WebhookStatusCard';

vi.mock('../../api/endpoints', () => ({
  getWebhookStatus: vi.fn(),
}));

const mockGetWebhookStatus = getWebhookStatus as unknown as ReturnType<typeof vi.fn>;

const DISCLAIMER_TEXT =
  /significa que vimos tráfico entrante.*no que Meta haya confirmado la suscripción/i;

describe('WebhookStatusCard Component', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('muestra estado "nunca conectado" cuando connected es false y lastEventAt es null', async () => {
    mockGetWebhookStatus.mockResolvedValue({
      connected: false,
      lastEventAt: null,
      lastMessageAt: null,
    });

    render(<WebhookStatusCard tenantId="tenant-1" token="tok" />);

    await waitFor(() => {
      expect(screen.getByTestId('webhook-status-indicator')).toBeInTheDocument();
    });

    const indicator = screen.getByTestId('webhook-status-indicator');
    expect(indicator).toHaveClass('webhook-status-indicator--inactive');
    expect(indicator).toHaveTextContent(
      'Todavía no recibimos ningún mensaje en este número. Verificá la configuración del webhook en Meta.',
    );
    expect(screen.getByTestId('webhook-status-disclaimer')).toHaveTextContent(DISCLAIMER_TEXT);
  });

  it('muestra estado "conectado pero sin eventos recientes" cuando lastEventAt tiene más de 24hs', async () => {
    const oldDate = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    mockGetWebhookStatus.mockResolvedValue({
      connected: true,
      lastEventAt: oldDate,
      lastMessageAt: oldDate,
    });

    render(<WebhookStatusCard tenantId="tenant-1" token="tok" />);

    await waitFor(() => {
      expect(screen.getByTestId('webhook-status-indicator')).toBeInTheDocument();
    });

    const indicator = screen.getByTestId('webhook-status-indicator');
    expect(indicator).toHaveClass('webhook-status-indicator--pending');
    expect(indicator).toHaveTextContent(
      'Recibimos tráfico anteriormente, pero no en las últimas 24 horas. Verificá que el webhook siga activo.',
    );
    expect(screen.getByTestId('webhook-status-disclaimer')).toHaveTextContent(DISCLAIMER_TEXT);
  });

  it('muestra estado "conectado" cuando connected es true y lastEventAt es reciente', async () => {
    const recentDate = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    mockGetWebhookStatus.mockResolvedValue({
      connected: true,
      lastEventAt: recentDate,
      lastMessageAt: recentDate,
    });

    render(<WebhookStatusCard tenantId="tenant-1" token="tok" />);

    await waitFor(() => {
      expect(screen.getByTestId('webhook-status-indicator')).toBeInTheDocument();
    });

    const indicator = screen.getByTestId('webhook-status-indicator');
    expect(indicator).toHaveClass('webhook-status-indicator--active');
    expect(indicator).toHaveTextContent('El webhook está recibiendo mensajes correctamente.');
    expect(screen.getByTestId('webhook-status-disclaimer')).toHaveTextContent(DISCLAIMER_TEXT);
  });

  it('llama a getWebhookStatus con tenantId y token al montar', async () => {
    mockGetWebhookStatus.mockResolvedValue({
      connected: false,
      lastEventAt: null,
      lastMessageAt: null,
    });

    render(<WebhookStatusCard tenantId="tenant-1" token="tok" />);

    await waitFor(() => {
      expect(mockGetWebhookStatus).toHaveBeenCalledWith('tenant-1', 'tok');
    });
  });
});
