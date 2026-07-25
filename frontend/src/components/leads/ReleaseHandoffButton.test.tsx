import { beforeEach, describe, it, expect, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import type { Lead } from '../../api/endpoints';
import { releaseLead } from '../../api/endpoints';
import { ReleaseHandoffButton } from './ReleaseHandoffButton';

vi.mock('../../api/endpoints', () => ({
  releaseLead: vi.fn(),
}));

describe('ReleaseHandoffButton Component', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  const mockReleaseLead = releaseLead as unknown as ReturnType<typeof vi.fn>;

  const mockLead: Lead = {
    id: 'lead-1',
    tenantId: 'tenant-1',
    phone: '+541234567890',
    name: 'Juan Pérez',
    state: 'HUMAN_HANDOFF',
    fOperation: 'SALE',
    fNeighborhoods: ['Palermo'],
    fMaxPrice: '500000',
    fCurrency: 'USD',
    fMinRooms: 2,
    fGarage: false,
    fPetsAllowed: true,
    fNotes: null,
    fPreferredDay: null,
    fOfferedNeighborhoods: [],
    fPriceMentionedAtTurn: null,
    handoffAt: '2026-07-24T10:00:00Z',
    optedOutAt: null,
    lastMessageAt: '2026-07-24T10:00:00Z',
    greetedAt: '2026-07-24T09:00:00Z',
    lastSearchIds: [],
    turnCount: 2,
    contactedAt: null,
    assignedUserId: null,
    nextActionAt: null,
    createdAt: '2026-07-24T09:00:00Z',
    updatedAt: '2026-07-24T10:00:00Z',
  };

  it('no se renderiza si lead.state no es HUMAN_HANDOFF', () => {
    const leadNotInHandoff: Lead = { ...mockLead, state: 'GREETING' };
    const onReleased = vi.fn();
    render(
      <ReleaseHandoffButton
        lead={leadNotInHandoff}
        tenantId="tenant-1"
        token="tok"
        onReleased={onReleased}
      />,
    );

    expect(screen.queryByTestId('release-handoff-button')).not.toBeInTheDocument();
  });

  it('se renderiza si lead.state es HUMAN_HANDOFF, con label "Devolver al agente IA"', () => {
    const onReleased = vi.fn();
    render(
      <ReleaseHandoffButton
        lead={mockLead}
        tenantId="tenant-1"
        token="tok"
        onReleased={onReleased}
      />,
    );

    expect(screen.getByTestId('release-handoff-button')).toBeInTheDocument();
    expect(screen.getByTestId('release-handoff-button')).toHaveTextContent(
      'Devolver al agente IA',
    );
  });

  it('el click en el botón principal abre el modal sin invocar releaseLead', () => {
    const onReleased = vi.fn();
    render(
      <ReleaseHandoffButton
        lead={mockLead}
        tenantId="tenant-1"
        token="tok"
        onReleased={onReleased}
      />,
    );

    expect(screen.queryByTestId('release-handoff-modal')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('release-handoff-button'));

    expect(screen.getByTestId('release-handoff-modal')).toBeInTheDocument();
    expect(mockReleaseLead).not.toHaveBeenCalled();
  });

  it('cancelar en el modal cierra el modal sin invocar releaseLead', () => {
    const onReleased = vi.fn();
    render(
      <ReleaseHandoffButton
        lead={mockLead}
        tenantId="tenant-1"
        token="tok"
        onReleased={onReleased}
      />,
    );

    fireEvent.click(screen.getByTestId('release-handoff-button'));
    expect(screen.getByTestId('release-handoff-modal')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('release-handoff-cancel'));

    expect(screen.queryByTestId('release-handoff-modal')).not.toBeInTheDocument();
    expect(mockReleaseLead).not.toHaveBeenCalled();
    expect(onReleased).not.toHaveBeenCalled();
  });

  it('invoca releaseLead solo al confirmar en el modal, y luego onReleased si tiene éxito', async () => {
    mockReleaseLead.mockResolvedValue({ released: true });

    const onReleased = vi.fn();
    render(
      <ReleaseHandoffButton
        lead={mockLead}
        tenantId="tenant-1"
        token="tok"
        onReleased={onReleased}
      />,
    );

    fireEvent.click(screen.getByTestId('release-handoff-button'));
    expect(mockReleaseLead).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('release-handoff-confirm'));

    await waitFor(() => {
      expect(onReleased).toHaveBeenCalled();
    });

    expect(mockReleaseLead).toHaveBeenCalledWith('tenant-1', 'lead-1', 'tok');
  });

  it('deshabilita el botón de confirmar mientras está cargando', async () => {
    mockReleaseLead.mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => resolve({ released: true }), 100);
        }),
    );

    const onReleased = vi.fn();
    render(
      <ReleaseHandoffButton
        lead={mockLead}
        tenantId="tenant-1"
        token="tok"
        onReleased={onReleased}
      />,
    );

    fireEvent.click(screen.getByTestId('release-handoff-button'));
    const confirmButton = screen.getByTestId('release-handoff-confirm');
    fireEvent.click(confirmButton);

    expect(confirmButton).toBeDisabled();
    expect(confirmButton).toHaveTextContent('Liberando...');

    await waitFor(() => {
      expect(onReleased).toHaveBeenCalled();
    });
  });

  it('muestra error si releaseLead falla, sin invocar onReleased, y el modal sigue abierto', async () => {
    mockReleaseLead.mockRejectedValue(new Error('Network error'));

    const onReleased = vi.fn();
    render(
      <ReleaseHandoffButton
        lead={mockLead}
        tenantId="tenant-1"
        token="tok"
        onReleased={onReleased}
      />,
    );

    fireEvent.click(screen.getByTestId('release-handoff-button'));
    fireEvent.click(screen.getByTestId('release-handoff-confirm'));

    await waitFor(() => {
      expect(screen.getByTestId('release-handoff-error')).toBeInTheDocument();
    });

    expect(onReleased).not.toHaveBeenCalled();
    expect(screen.getByTestId('release-handoff-modal')).toBeInTheDocument();
  });
});
