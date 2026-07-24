import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ContactedToggle } from './ContactedToggle';
import * as endpoints from '../../api/endpoints';
import type { Lead } from '../../api/endpoints';

function buildLead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: 'lead-1',
    tenantId: 'tenant-1',
    phone: '+5491111111',
    name: 'Juan Pérez',
    state: 'GREETING',
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
    turnCount: 0,
    contactedAt: null,
    assignedUserId: null,
    nextActionAt: null,
    createdAt: '2026-07-24T00:00:00.000Z',
    updatedAt: '2026-07-24T00:00:00.000Z',
    ...overrides,
  };
}

describe('ContactedToggle Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renderiza un botón con label "Marcar como contactado" cuando contactedAt es null', () => {
    const lead = buildLead({ contactedAt: null });
    const onUpdated = vi.fn();

    render(
      <ContactedToggle
        lead={lead}
        tenantId="tenant-1"
        token="token-1"
        onUpdated={onUpdated}
      />,
    );

    const button = screen.getByTestId('contacted-toggle-btn');
    expect(button).toBeInTheDocument();
    expect(button).toHaveTextContent('Marcar como contactado');
  });

  it('renderiza un botón con label "Marcar como no contactado" cuando contactedAt tiene valor', () => {
    const lead = buildLead({ contactedAt: '2026-07-24T10:00:00.000Z' });
    const onUpdated = vi.fn();

    render(
      <ContactedToggle
        lead={lead}
        tenantId="tenant-1"
        token="token-1"
        onUpdated={onUpdated}
      />,
    );

    const button = screen.getByTestId('contacted-toggle-btn');
    expect(button).toBeInTheDocument();
    expect(button).toHaveTextContent('Marcar como no contactado');
  });

  it('invoca markContacted si contactedAt es null y hace click (AC-9)', async () => {
    const lead = buildLead({ contactedAt: null });
    const updatedLead = buildLead({
      contactedAt: '2026-07-24T10:00:00.000Z',
    });
    const onUpdated = vi.fn();

    vi.spyOn(endpoints, 'markContacted').mockResolvedValue(updatedLead);

    render(
      <ContactedToggle
        lead={lead}
        tenantId="tenant-1"
        token="token-1"
        onUpdated={onUpdated}
      />,
    );

    const button = screen.getByTestId('contacted-toggle-btn');
    const user = userEvent.setup();
    await user.click(button);

    await waitFor(() =>
      expect(endpoints.markContacted).toHaveBeenCalledWith('tenant-1', 'lead-1', 'token-1'),
    );
  });

  it('invoca markUncontacted si contactedAt tiene valor y hace click (AC-10)', async () => {
    const lead = buildLead({ contactedAt: '2026-07-24T10:00:00.000Z' });
    const updatedLead = buildLead({ contactedAt: null });
    const onUpdated = vi.fn();

    vi.spyOn(endpoints, 'markUncontacted').mockResolvedValue(updatedLead);

    render(
      <ContactedToggle
        lead={lead}
        tenantId="tenant-1"
        token="token-1"
        onUpdated={onUpdated}
      />,
    );

    const button = screen.getByTestId('contacted-toggle-btn');
    const user = userEvent.setup();
    await user.click(button);

    await waitFor(() =>
      expect(endpoints.markUncontacted).toHaveBeenCalledWith('tenant-1', 'lead-1', 'token-1'),
    );
  });

  it('invoca onUpdated con el lead devuelto por markContacted (AC-11)', async () => {
    const lead = buildLead({ contactedAt: null });
    const updatedLead = buildLead({
      contactedAt: '2026-07-24T10:00:00.000Z',
    });
    const onUpdated = vi.fn();

    vi.spyOn(endpoints, 'markContacted').mockResolvedValue(updatedLead);

    render(
      <ContactedToggle
        lead={lead}
        tenantId="tenant-1"
        token="token-1"
        onUpdated={onUpdated}
      />,
    );

    const button = screen.getByTestId('contacted-toggle-btn');
    const user = userEvent.setup();
    await user.click(button);

    await waitFor(() =>
      expect(onUpdated).toHaveBeenCalledWith(updatedLead),
    );
  });

  it('invoca onUpdated con el lead devuelto por markUncontacted', async () => {
    const lead = buildLead({ contactedAt: '2026-07-24T10:00:00.000Z' });
    const updatedLead = buildLead({ contactedAt: null });
    const onUpdated = vi.fn();

    vi.spyOn(endpoints, 'markUncontacted').mockResolvedValue(updatedLead);

    render(
      <ContactedToggle
        lead={lead}
        tenantId="tenant-1"
        token="token-1"
        onUpdated={onUpdated}
      />,
    );

    const button = screen.getByTestId('contacted-toggle-btn');
    const user = userEvent.setup();
    await user.click(button);

    await waitFor(() =>
      expect(onUpdated).toHaveBeenCalledWith(updatedLead),
    );
  });

  it('deshabilita el botón mientras está cargando', async () => {
    const lead = buildLead({ contactedAt: null });
    let resolvePromise: (value: Lead) => void = () => {};
    const onUpdated = vi.fn();

    vi.spyOn(endpoints, 'markContacted').mockReturnValue(
      new Promise((resolve) => {
        resolvePromise = resolve;
      }),
    );

    render(
      <ContactedToggle
        lead={lead}
        tenantId="tenant-1"
        token="token-1"
        onUpdated={onUpdated}
      />,
    );

    const button = screen.getByTestId('contacted-toggle-btn');
    const user = userEvent.setup();
    await user.click(button);

    expect(button).toBeDisabled();
    expect(button).toHaveTextContent('Actualizando...');

    resolvePromise(buildLead({ contactedAt: '2026-07-24T10:00:00.000Z' }));

    await waitFor(() => {
      expect(button).not.toBeDisabled();
    });
  });

  it('muestra un mensaje de error si la API falla', async () => {
    const lead = buildLead({ contactedAt: null });
    const onUpdated = vi.fn();

    vi.spyOn(endpoints, 'markContacted').mockRejectedValue(new Error('Error de red.'));

    render(
      <ContactedToggle
        lead={lead}
        tenantId="tenant-1"
        token="token-1"
        onUpdated={onUpdated}
      />,
    );

    const button = screen.getByTestId('contacted-toggle-btn');
    const user = userEvent.setup();
    await user.click(button);

    expect(await screen.findByTestId('contacted-toggle-error')).toBeInTheDocument();
    expect(screen.getByTestId('contacted-toggle-error')).toHaveTextContent(
      'No se pudo actualizar el estado. Intentá nuevamente.',
    );
    expect(onUpdated).not.toHaveBeenCalled();
  });

  it('no invoca onUpdated si hay error en markContacted', async () => {
    const lead = buildLead({ contactedAt: null });
    const onUpdated = vi.fn();

    vi.spyOn(endpoints, 'markContacted').mockRejectedValue(new Error('Error de red.'));

    render(
      <ContactedToggle
        lead={lead}
        tenantId="tenant-1"
        token="token-1"
        onUpdated={onUpdated}
      />,
    );

    const button = screen.getByTestId('contacted-toggle-btn');
    const user = userEvent.setup();
    await user.click(button);

    await screen.findByTestId('contacted-toggle-error');

    expect(onUpdated).not.toHaveBeenCalled();
  });

  it('no invoca onUpdated si hay error en markUncontacted', async () => {
    const lead = buildLead({ contactedAt: '2026-07-24T10:00:00.000Z' });
    const onUpdated = vi.fn();

    vi.spyOn(endpoints, 'markUncontacted').mockRejectedValue(new Error('Error de red.'));

    render(
      <ContactedToggle
        lead={lead}
        tenantId="tenant-1"
        token="token-1"
        onUpdated={onUpdated}
      />,
    );

    const button = screen.getByTestId('contacted-toggle-btn');
    const user = userEvent.setup();
    await user.click(button);

    await screen.findByTestId('contacted-toggle-error');

    expect(onUpdated).not.toHaveBeenCalled();
  });
});
