import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Lead } from '../../api/endpoints';
import * as endpoints from '../../api/endpoints';
import { OptOutButton } from './OptOutButton';

describe('OptOutButton', () => {
  const baseLead: Lead = {
    id: 'lead-1',
    tenantId: 'tenant-1',
    phone: '+541234567890',
    name: 'Juan Pérez',
    state: 'QUALIFICATION',
    fOperation: null,
    fNeighborhoods: [],
    fMaxPrice: null,
    fCurrency: null,
    fMinRooms: null,
    fGarage: null,
    fPetsAllowed: null,
    fNotes: null,
    fPreferredDay: null,
    fOfferedNeighborhoods: [],
    fPriceMentionedAtTurn: null,
    handoffAt: null,
    optedOutAt: null,
    lastMessageAt: null,
    greetedAt: null,
    lastSearchIds: [],
    turnCount: 1,
    contactedAt: null,
    assignedUserId: null,
    nextActionAt: null,
    createdAt: '2026-07-24T09:00:00Z',
    updatedAt: '2026-07-24T09:00:00Z',
  };

  beforeEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('no renderiza el botón si el lead ya está OPTED_OUT (AC-16/AC-17)', () => {
    const optedOutLead: Lead = { ...baseLead, state: 'OPTED_OUT' };
    render(
      <OptOutButton lead={optedOutLead} tenantId="tenant-1" token="tok" onUpdated={vi.fn()} />,
    );
    expect(screen.queryByTestId('opt-out-button')).not.toBeInTheDocument();
  });

  it('pide confirmación y NO invoca optOutLead si el usuario cancela', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const optOutSpy = vi.spyOn(endpoints, 'optOutLead');
    const onUpdated = vi.fn();
    const user = userEvent.setup();

    render(<OptOutButton lead={baseLead} tenantId="tenant-1" token="tok" onUpdated={onUpdated} />);
    await user.click(screen.getByTestId('opt-out-button'));

    expect(window.confirm).toHaveBeenCalled();
    expect(optOutSpy).not.toHaveBeenCalled();
    expect(onUpdated).not.toHaveBeenCalled();
  });

  it('confirma, invoca optOutLead y llama a onUpdated con el lead devuelto', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const updatedLead: Lead = { ...baseLead, state: 'OPTED_OUT', optedOutAt: '2026-07-24T10:00:00Z' };
    const optOutSpy = vi.spyOn(endpoints, 'optOutLead').mockResolvedValue(updatedLead);
    const onUpdated = vi.fn();
    const user = userEvent.setup();

    render(<OptOutButton lead={baseLead} tenantId="tenant-1" token="tok" onUpdated={onUpdated} />);
    await user.click(screen.getByTestId('opt-out-button'));

    await waitFor(() => {
      expect(optOutSpy).toHaveBeenCalledWith('tenant-1', 'lead-1', 'tok');
    });
    await waitFor(() => {
      expect(onUpdated).toHaveBeenCalledWith(updatedLead);
    });
  });
});
