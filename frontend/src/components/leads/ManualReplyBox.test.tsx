import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, act } from '@testing-library/react';
import type { Lead } from '../../api/endpoints';
import { sendManualMessage } from '../../api/endpoints';
import { ToastProvider } from '../ui';
import { ManualReplyBox } from './ManualReplyBox';

vi.mock('../../api/endpoints', () => ({
  sendManualMessage: vi.fn(),
}));

describe('ManualReplyBox Component', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const mockSendManualMessage = sendManualMessage as unknown as ReturnType<typeof vi.fn>;

  const baseLead: Lead = {
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
    handoffAt: '2026-07-26T09:00:00Z',
    optedOutAt: null,
    lastMessageAt: '2026-07-26T09:00:00Z',
    lastInboundAt: '2026-07-26T09:00:00Z', // hace 3hs -> quedan 21hs
    greetedAt: '2026-07-26T08:00:00Z',
    lastSearchIds: [],
    turnCount: 2,
    contactedAt: null,
    assignedUserId: null,
    nextActionAt: null,
    createdAt: '2026-07-26T08:00:00Z',
    updatedAt: '2026-07-26T09:00:00Z',
  };

  function renderBox(lead: Lead, onSent = vi.fn()) {
    render(
      <ToastProvider>
        <ManualReplyBox lead={lead} tenantId="tenant-1" token="tok" onSent={onSent} />
      </ToastProvider>,
    );
    return { onSent };
  }

  it('muestra el remanente de la ventana de 24hs formateado (AC-18)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-26T12:00:00Z'));

    renderBox(baseLead);

    expect(screen.getByTestId('manual-reply-window')).toHaveTextContent('quedan 21 h 0 m');
  });

  it('recalcula el remanente cada 60s vía setInterval', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-26T12:00:00Z'));

    renderBox(baseLead);

    expect(screen.getByTestId('manual-reply-window')).toHaveTextContent('quedan 21 h 0 m');

    act(() => {
      vi.advanceTimersByTime(30 * 60_000);
    });

    expect(screen.getByTestId('manual-reply-window')).toHaveTextContent('quedan 20 h 30 m');
  });

  it('deshabilita la caja con copy explicativo si venció la ventana (AC-19)', () => {
    const expiredLead: Lead = {
      ...baseLead,
      lastInboundAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
    };
    renderBox(expiredLead);

    expect(screen.queryByTestId('manual-reply-window')).not.toBeInTheDocument();
    expect(screen.getByTestId('manual-reply-disabled-reason')).toHaveTextContent(/venció/i);
    expect(screen.getByTestId('manual-reply-textarea')).toBeDisabled();
  });

  it('deshabilita la caja con copy explicativo si nunca hubo un mensaje IN', () => {
    const noInboundLead: Lead = { ...baseLead, lastInboundAt: null };
    renderBox(noInboundLead);

    expect(screen.getByTestId('manual-reply-disabled-reason')).toBeInTheDocument();
    expect(screen.getByTestId('manual-reply-textarea')).toBeDisabled();
  });

  it('deshabilita la caja con copy explicativo si el lead está OPTED_OUT (AC-19)', () => {
    const optedOutLead: Lead = {
      ...baseLead,
      state: 'OPTED_OUT',
      lastInboundAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    };
    renderBox(optedOutLead);

    expect(screen.getByTestId('manual-reply-disabled-reason')).toHaveTextContent(/baja/i);
    expect(screen.getByTestId('manual-reply-textarea')).toBeDisabled();
  });

  it('el botón de enviar permanece deshabilitado con texto vacío', () => {
    const activeLead: Lead = {
      ...baseLead,
      lastInboundAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    };
    renderBox(activeLead);

    expect(screen.getByTestId('manual-reply-send')).toBeDisabled();

    fireEvent.change(screen.getByTestId('manual-reply-textarea'), {
      target: { value: '   ' },
    });

    expect(screen.getByTestId('manual-reply-send')).toBeDisabled();
  });

  it('al enviar con éxito: muestra toast, invoca onSent y limpia el textarea (AC-16)', async () => {
    const activeLead: Lead = {
      ...baseLead,
      lastInboundAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    };
    mockSendManualMessage.mockResolvedValue({
      message: { id: 'm1' },
      lead: activeLead,
    });
    const { onSent } = renderBox(activeLead);

    fireEvent.change(screen.getByTestId('manual-reply-textarea'), {
      target: { value: 'Hola, te escribe un asesor' },
    });
    fireEvent.click(screen.getByTestId('manual-reply-send'));

    await waitFor(() => {
      expect(onSent).toHaveBeenCalled();
    });

    expect(mockSendManualMessage).toHaveBeenCalledWith(
      'tenant-1',
      'lead-1',
      'Hola, te escribe un asesor',
      'tok',
    );
    expect(screen.getByTestId('manual-reply-textarea')).toHaveValue('');
    expect(screen.getByTestId('toast')).toBeInTheDocument();
  });

  it('ante error no limpia el textarea (incluye 409 por reloj desfasado)', async () => {
    const activeLead: Lead = {
      ...baseLead,
      lastInboundAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    };
    mockSendManualMessage.mockRejectedValue(new Error('Conflict'));
    const { onSent } = renderBox(activeLead);

    fireEvent.change(screen.getByTestId('manual-reply-textarea'), {
      target: { value: 'Texto que no se debe perder' },
    });
    fireEvent.click(screen.getByTestId('manual-reply-send'));

    await waitFor(() => {
      expect(mockSendManualMessage).toHaveBeenCalled();
    });

    expect(screen.getByTestId('manual-reply-textarea')).toHaveValue('Texto que no se debe perder');
    expect(onSent).not.toHaveBeenCalled();
  });
});
