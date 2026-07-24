import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AssignmentControl } from './AssignmentControl';
import * as endpoints from '../../api/endpoints';
import type { AssignableUser, Lead } from '../../api/endpoints';

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

const assignableUsers: AssignableUser[] = [
  { id: 'user-1', email: 'agente1@inmo.com', role: 'AGENT' },
  { id: 'user-2', email: 'owner@inmo.com', role: 'OWNER' },
];

describe('AssignmentControl Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('el selector muestra las opciones de assignableUsers más "Sin asignar"', () => {
    const lead = buildLead();
    render(
      <AssignmentControl
        lead={lead}
        assignableUsers={assignableUsers}
        tenantId="tenant-1"
        leadId="lead-1"
        token="token-1"
        onUpdated={vi.fn()}
      />,
    );

    const select = screen.getByTestId('assignment-control-select') as HTMLSelectElement;
    const options = Array.from(select.options).map((o) => o.value);
    expect(options).toEqual(['__unassigned__', 'user-1', 'user-2']);
    expect(screen.getByText('agente1@inmo.com')).toBeInTheDocument();
    expect(screen.getByText('owner@inmo.com')).toBeInTheDocument();
  });

  it('muestra el email del asignado actual resolviendo assignedUserId contra assignableUsers', () => {
    const lead = buildLead({ assignedUserId: 'user-1' });
    render(
      <AssignmentControl
        lead={lead}
        assignableUsers={assignableUsers}
        tenantId="tenant-1"
        leadId="lead-1"
        token="token-1"
        onUpdated={vi.fn()}
      />,
    );

    expect(screen.getByTestId('assignment-control-current')).toHaveTextContent(
      'Asignado a: agente1@inmo.com',
    );
  });

  it('muestra el id crudo como fallback si el asignado no está en la lista (persona desactivada)', () => {
    const lead = buildLead({ assignedUserId: 'user-desactivado' });
    render(
      <AssignmentControl
        lead={lead}
        assignableUsers={assignableUsers}
        tenantId="tenant-1"
        leadId="lead-1"
        token="token-1"
        onUpdated={vi.fn()}
      />,
    );

    expect(screen.getByTestId('assignment-control-current')).toHaveTextContent(
      'Asignado a: user-desactivado',
    );
  });

  it('guardar solo nextActionAt (sin tocar el selector) NO incluye assignedUserId en el PATCH', async () => {
    const lead = buildLead({ assignedUserId: 'user-1' });
    const updatedLead = buildLead({ assignedUserId: 'user-1', nextActionAt: '2026-08-01T15:00:00.000Z' });
    vi.spyOn(endpoints, 'patchAssignment').mockResolvedValue(updatedLead);

    render(
      <AssignmentControl
        lead={lead}
        assignableUsers={assignableUsers}
        tenantId="tenant-1"
        leadId="lead-1"
        token="token-1"
        onUpdated={vi.fn()}
      />,
    );

    const user = userEvent.setup();
    const nextActionInput = screen.getByTestId('assignment-control-next-action');
    await user.clear(nextActionInput);
    await user.type(nextActionInput, '2026-08-01T15:00');

    await user.click(screen.getByTestId('assignment-control-save'));

    await waitFor(() => expect(endpoints.patchAssignment).toHaveBeenCalled());
    const dto = (endpoints.patchAssignment as unknown as ReturnType<typeof vi.fn>).mock.calls[0][2];
    expect(dto).not.toHaveProperty('assignedUserId');
    expect(dto).toHaveProperty('nextActionAt');
  });

  it('elegir "Sin asignar" manda assignedUserId: null', async () => {
    const lead = buildLead({ assignedUserId: 'user-1' });
    const updatedLead = buildLead({ assignedUserId: null });
    vi.spyOn(endpoints, 'patchAssignment').mockResolvedValue(updatedLead);

    render(
      <AssignmentControl
        lead={lead}
        assignableUsers={assignableUsers}
        tenantId="tenant-1"
        leadId="lead-1"
        token="token-1"
        onUpdated={vi.fn()}
      />,
    );

    const user = userEvent.setup();
    const select = screen.getByTestId('assignment-control-select');
    await user.selectOptions(select, '__unassigned__');
    await user.click(screen.getByTestId('assignment-control-save'));

    await waitFor(() =>
      expect(endpoints.patchAssignment).toHaveBeenCalledWith(
        'tenant-1',
        'lead-1',
        { assignedUserId: null },
        'token-1',
      ),
    );
  });

  it('invoca onUpdated con el lead devuelto por el PATCH exitoso', async () => {
    const lead = buildLead({ assignedUserId: 'user-1' });
    const updatedLead = buildLead({ assignedUserId: 'user-2' });
    const onUpdated = vi.fn();
    vi.spyOn(endpoints, 'patchAssignment').mockResolvedValue(updatedLead);

    render(
      <AssignmentControl
        lead={lead}
        assignableUsers={assignableUsers}
        tenantId="tenant-1"
        leadId="lead-1"
        token="token-1"
        onUpdated={onUpdated}
      />,
    );

    const user = userEvent.setup();
    await user.selectOptions(screen.getByTestId('assignment-control-select'), 'user-2');
    await user.click(screen.getByTestId('assignment-control-save'));

    await waitFor(() => expect(onUpdated).toHaveBeenCalledWith(updatedLead));
  });

  it('un error 400 del backend se muestra sin crashear y sin perder el estado del formulario', async () => {
    const lead = buildLead({ assignedUserId: 'user-1' });
    const onUpdated = vi.fn();
    vi.spyOn(endpoints, 'patchAssignment').mockRejectedValue(new Error('Bad Request'));

    render(
      <AssignmentControl
        lead={lead}
        assignableUsers={assignableUsers}
        tenantId="tenant-1"
        leadId="lead-1"
        token="token-1"
        onUpdated={onUpdated}
      />,
    );

    const user = userEvent.setup();
    await user.selectOptions(screen.getByTestId('assignment-control-select'), 'user-2');
    await user.click(screen.getByTestId('assignment-control-save'));

    expect(await screen.findByTestId('assignment-control-error')).toBeInTheDocument();
    expect(onUpdated).not.toHaveBeenCalled();

    const select = screen.getByTestId('assignment-control-select') as HTMLSelectElement;
    expect(select.value).toBe('user-2');
  });
});
