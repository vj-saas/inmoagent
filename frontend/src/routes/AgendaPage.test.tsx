import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AgendaPage } from './AgendaPage';
import { AuthProvider } from '../auth/AuthContext';
import { clearSession, setSession } from '../auth/session-store';
import { onUnauthorized } from '../api/http-client';
import * as endpoints from '../api/endpoints';
import type { Appointment } from '../api/endpoints';

function renderAgendaPage(): void {
  render(
    <MemoryRouter>
      <AuthProvider>
        <AgendaPage />
      </AuthProvider>
    </MemoryRouter>,
  );
}

function buildAppointment(overrides: Partial<Appointment> = {}): Appointment {
  return {
    id: 'appt-1',
    tenantId: 'tenant-1',
    leadId: 'lead-1',
    status: 'PROPOSED',
    scheduledAt: null,
    notes: null,
    outcome: null,
    assignedUserId: null,
    createdAt: '2026-07-24T00:00:00.000Z',
    updatedAt: '2026-07-24T00:00:00.000Z',
    ...overrides,
  };
}

describe('AgendaPage', () => {
  beforeEach(() => {
    clearSession();
    onUnauthorized(() => {});
    setSession({ token: 't1', role: 'OWNER', tenantId: 'tenant-1', email: 'owner@a.com' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    clearSession();
  });

  // AC-1
  it('carga inicial llama listAppointments con el tenantId y un rango por defecto de hoy a proximos 7 dias', async () => {
    vi.spyOn(endpoints, 'listAppointments').mockResolvedValue({ appointments: [] });

    renderAgendaPage();

    await waitFor(() => expect(endpoints.listAppointments).toHaveBeenCalledTimes(1));

    const [tenantId, query, token] = vi.mocked(endpoints.listAppointments).mock.calls[0];
    expect(tenantId).toBe('tenant-1');
    expect(token).toBe('t1');

    const from = new Date(query.from as string);
    const to = new Date(query.to as string);
    const diffDays = Math.round((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
    expect(diffDays).toBeGreaterThanOrEqual(6);
    expect(diffDays).toBeLessThanOrEqual(7);
  });

  // AC-2
  it('muestra cada cita con fecha/hora o "sin confirmar", estado y datos del lead, ordenadas por scheduledAt ascendente', async () => {
    vi.spyOn(endpoints, 'listAppointments').mockResolvedValue({
      appointments: [
        buildAppointment({
          id: 'appt-confirmed',
          status: 'CONFIRMED',
          scheduledAt: '2026-07-26T15:00:00.000Z',
        }),
        buildAppointment({ id: 'appt-proposed', status: 'PROPOSED', scheduledAt: null }),
      ],
    });

    renderAgendaPage();

    const list = await screen.findByTestId('appointments-list');
    const rows = within(list).getAllByTestId('appointment-row');
    expect(rows).toHaveLength(2);
    expect(screen.getByText(/sin confirmar/i)).toBeInTheDocument();
  });

  // AC-3
  it('cambiar rango de fechas o estado reinvoca listAppointments con los nuevos parametros', async () => {
    vi.spyOn(endpoints, 'listAppointments').mockResolvedValue({ appointments: [] });

    renderAgendaPage();
    await waitFor(() => expect(endpoints.listAppointments).toHaveBeenCalledTimes(1));

    const user = userEvent.setup();
    const statusFilter = screen.getByTestId('appointment-status-filter');
    await user.selectOptions(statusFilter, 'CONFIRMED');

    await waitFor(() =>
      expect(endpoints.listAppointments).toHaveBeenLastCalledWith(
        'tenant-1',
        expect.objectContaining({ status: ['CONFIRMED'] }),
        't1',
      ),
    );
  });

  // AC-4
  it('cita PROPOSED ofrece solo Confirmar y Cancelar', async () => {
    vi.spyOn(endpoints, 'listAppointments').mockResolvedValue({
      appointments: [buildAppointment({ status: 'PROPOSED' })],
    });

    renderAgendaPage();

    const row = await screen.findByTestId('appointment-row');
    expect(within(row).getByRole('button', { name: /confirmar/i })).toBeInTheDocument();
    expect(within(row).getByRole('button', { name: /cancelar/i })).toBeInTheDocument();
    expect(within(row).queryByRole('button', { name: /reprogramar/i })).not.toBeInTheDocument();
    expect(within(row).queryByRole('button', { name: /marcar hecha/i })).not.toBeInTheDocument();
    expect(within(row).queryByRole('button', { name: /marcar no-show/i })).not.toBeInTheDocument();
  });

  // AC-5
  it('cita CONFIRMED ofrece Reprogramar, Cancelar, Marcar hecha y Marcar no-show', async () => {
    vi.spyOn(endpoints, 'listAppointments').mockResolvedValue({
      appointments: [buildAppointment({ status: 'CONFIRMED', scheduledAt: '2026-07-25T10:00:00.000Z' })],
    });

    renderAgendaPage();

    const row = await screen.findByTestId('appointment-row');
    expect(within(row).getByRole('button', { name: /reprogramar/i })).toBeInTheDocument();
    expect(within(row).getByRole('button', { name: /cancelar/i })).toBeInTheDocument();
    expect(within(row).getByRole('button', { name: /marcar hecha/i })).toBeInTheDocument();
    expect(within(row).getByRole('button', { name: /marcar no-show/i })).toBeInTheDocument();
    expect(within(row).queryByRole('button', { name: /^confirmar$/i })).not.toBeInTheDocument();
  });

  // AC-6
  it.each(['DONE', 'CANCELLED', 'NO_SHOW'] as const)(
    'cita %s no ofrece ninguna accion de transicion',
    async (status) => {
      vi.spyOn(endpoints, 'listAppointments').mockResolvedValue({
        appointments: [buildAppointment({ status })],
      });

      renderAgendaPage();

      const row = await screen.findByTestId('appointment-row');
      expect(within(row).queryByRole('button')).not.toBeInTheDocument();
    },
  );

  // AC-7
  it('Confirmar con fecha/hora valida invoca confirmAppointment y actualiza la fila sin recargar la lista', async () => {
    vi.spyOn(endpoints, 'listAppointments').mockResolvedValue({
      appointments: [buildAppointment({ id: 'appt-1', status: 'PROPOSED' })],
    });
    vi.spyOn(endpoints, 'confirmAppointment').mockResolvedValue(
      buildAppointment({ id: 'appt-1', status: 'CONFIRMED', scheduledAt: '2026-07-25T15:00:00.000Z' }),
    );

    renderAgendaPage();
    const user = userEvent.setup();
    const row = await screen.findByTestId('appointment-row');
    await user.click(within(row).getByRole('button', { name: /confirmar/i }));

    const dateInput = await screen.findByTestId('scheduled-at-input');
    await user.type(dateInput, '2026-07-25T15:00');
    await user.click(screen.getByRole('button', { name: /guardar|confirmar cita/i }));

    await waitFor(() =>
      expect(endpoints.confirmAppointment).toHaveBeenCalledWith(
        'tenant-1',
        'appt-1',
        expect.objectContaining({ scheduledAt: expect.any(String) }),
        't1',
      ),
    );
    expect(endpoints.listAppointments).toHaveBeenCalledTimes(1);
  });

  // AC-8
  it('Confirmar sin fecha/hora no invoca confirmAppointment y muestra un mensaje de validacion', async () => {
    vi.spyOn(endpoints, 'listAppointments').mockResolvedValue({
      appointments: [buildAppointment({ id: 'appt-1', status: 'PROPOSED' })],
    });
    vi.spyOn(endpoints, 'confirmAppointment').mockResolvedValue(
      buildAppointment({ id: 'appt-1', status: 'CONFIRMED' }),
    );

    renderAgendaPage();
    const user = userEvent.setup();
    const row = await screen.findByTestId('appointment-row');
    await user.click(within(row).getByRole('button', { name: /confirmar/i }));
    await user.click(screen.getByRole('button', { name: /guardar|confirmar cita/i }));

    expect(await screen.findByText(/seleccion[aá] una fecha/i)).toBeInTheDocument();
    expect(endpoints.confirmAppointment).not.toHaveBeenCalled();
  });

  // AC-9
  it('Reprogramar con nueva fecha/hora invoca rescheduleAppointment y mantiene el estado CONFIRMED', async () => {
    vi.spyOn(endpoints, 'listAppointments').mockResolvedValue({
      appointments: [
        buildAppointment({ id: 'appt-1', status: 'CONFIRMED', scheduledAt: '2026-07-25T10:00:00.000Z' }),
      ],
    });
    vi.spyOn(endpoints, 'rescheduleAppointment').mockResolvedValue(
      buildAppointment({ id: 'appt-1', status: 'CONFIRMED', scheduledAt: '2026-07-26T11:00:00.000Z' }),
    );

    renderAgendaPage();
    const user = userEvent.setup();
    const row = await screen.findByTestId('appointment-row');
    await user.click(within(row).getByRole('button', { name: /reprogramar/i }));

    const dateInput = await screen.findByTestId('scheduled-at-input');
    await user.type(dateInput, '2026-07-26T11:00');
    await user.click(screen.getByRole('button', { name: /guardar|reprogramar cita/i }));

    await waitFor(() =>
      expect(endpoints.rescheduleAppointment).toHaveBeenCalledWith(
        'tenant-1',
        'appt-1',
        expect.objectContaining({ scheduledAt: expect.any(String) }),
        't1',
      ),
    );
  });

  // AC-10
  it('Cancelar pide confirmacion antes de invocar cancelAppointment y actualiza la fila a CANCELLED', async () => {
    vi.spyOn(endpoints, 'listAppointments').mockResolvedValue({
      appointments: [buildAppointment({ id: 'appt-1', status: 'PROPOSED' })],
    });
    vi.spyOn(endpoints, 'cancelAppointment').mockResolvedValue(
      buildAppointment({ id: 'appt-1', status: 'CANCELLED' }),
    );
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    renderAgendaPage();
    const user = userEvent.setup();
    const row = await screen.findByTestId('appointment-row');
    await user.click(within(row).getByRole('button', { name: /cancelar/i }));

    expect(confirmSpy).toHaveBeenCalled();
    await waitFor(() => expect(endpoints.cancelAppointment).toHaveBeenCalledWith('tenant-1', 'appt-1', expect.any(Object), 't1'));
  });

  // AC-11
  it('Marcar hecha invoca markAppointmentDone y actualiza la fila a DONE sin acciones', async () => {
    vi.spyOn(endpoints, 'listAppointments').mockResolvedValue({
      appointments: [
        buildAppointment({ id: 'appt-1', status: 'CONFIRMED', scheduledAt: '2026-07-25T10:00:00.000Z' }),
      ],
    });
    vi.spyOn(endpoints, 'markAppointmentDone').mockResolvedValue(
      buildAppointment({ id: 'appt-1', status: 'DONE' }),
    );

    renderAgendaPage();
    const user = userEvent.setup();
    const row = await screen.findByTestId('appointment-row');
    await user.click(within(row).getByRole('button', { name: /marcar hecha/i }));

    await waitFor(() => expect(endpoints.markAppointmentDone).toHaveBeenCalledWith('tenant-1', 'appt-1', expect.any(Object), 't1'));
  });

  // AC-12
  it('Marcar no-show invoca markAppointmentNoShow y actualiza la fila a NO_SHOW sin acciones', async () => {
    vi.spyOn(endpoints, 'listAppointments').mockResolvedValue({
      appointments: [
        buildAppointment({ id: 'appt-1', status: 'CONFIRMED', scheduledAt: '2026-07-25T10:00:00.000Z' }),
      ],
    });
    vi.spyOn(endpoints, 'markAppointmentNoShow').mockResolvedValue(
      buildAppointment({ id: 'appt-1', status: 'NO_SHOW' }),
    );

    renderAgendaPage();
    const user = userEvent.setup();
    const row = await screen.findByTestId('appointment-row');
    await user.click(within(row).getByRole('button', { name: /marcar no-show/i }));

    await waitFor(() => expect(endpoints.markAppointmentNoShow).toHaveBeenCalledWith('tenant-1', 'appt-1', expect.any(Object), 't1'));
  });

  // AC-13
  it('mientras una accion esta en curso, el boton que la disparo queda deshabilitado', async () => {
    vi.spyOn(endpoints, 'listAppointments').mockResolvedValue({
      appointments: [
        buildAppointment({ id: 'appt-1', status: 'CONFIRMED', scheduledAt: '2026-07-25T10:00:00.000Z' }),
      ],
    });
    let resolveDone: (value: Appointment) => void = () => {};
    vi.spyOn(endpoints, 'markAppointmentDone').mockReturnValue(
      new Promise((resolve) => {
        resolveDone = resolve;
      }),
    );

    renderAgendaPage();
    const user = userEvent.setup();
    const row = await screen.findByTestId('appointment-row');
    const doneBtn = within(row).getByRole('button', { name: /marcar hecha/i });
    await user.click(doneBtn);

    expect(doneBtn).toBeDisabled();
    resolveDone(buildAppointment({ id: 'appt-1', status: 'DONE' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: /marcar hecha/i })).not.toBeInTheDocument());
  });

  // AC-14
  it('si el backend rechaza una accion, muestra un error legible y no cambia el estado mostrado', async () => {
    vi.spyOn(endpoints, 'listAppointments').mockResolvedValue({
      appointments: [
        buildAppointment({ id: 'appt-1', status: 'CONFIRMED', scheduledAt: '2026-07-25T10:00:00.000Z' }),
      ],
    });
    vi.spyOn(endpoints, 'markAppointmentDone').mockRejectedValue(new Error('La cita ya no admite esta transición.'));

    renderAgendaPage();
    const user = userEvent.setup();
    const row = await screen.findByTestId('appointment-row');
    await user.click(within(row).getByRole('button', { name: /marcar hecha/i }));

    expect(await screen.findByTestId('error-banner')).toHaveTextContent(
      'La cita ya no admite esta transición.',
    );
    expect(within(row).getByRole('button', { name: /marcar hecha/i })).toBeInTheDocument();
  });

  // AC-15
  it('muestra Spinner mientras listAppointments esta en curso', async () => {
    let resolvePromise: (value: { appointments: Appointment[] }) => void = () => {};
    vi.spyOn(endpoints, 'listAppointments').mockReturnValue(
      new Promise((resolve) => {
        resolvePromise = resolve;
      }),
    );

    renderAgendaPage();

    expect(await screen.findByTestId('spinner')).toBeInTheDocument();

    resolvePromise({ appointments: [] });
    await waitFor(() => expect(screen.queryByTestId('spinner')).not.toBeInTheDocument());
  });

  // AC-16
  it('si listAppointments falla, muestra un ErrorBanner y no una lista vacia', async () => {
    vi.spyOn(endpoints, 'listAppointments').mockRejectedValue(new Error('Error de red.'));

    renderAgendaPage();

    expect(await screen.findByTestId('error-banner')).toHaveTextContent('Error de red.');
    expect(screen.queryByTestId('appointments-list')).not.toBeInTheDocument();
  });

  // AC-17
  it('siempre invoca los endpoints de appointments con el tenantId de la sesion, nunca uno arbitrario', async () => {
    setSession({ token: 't9', role: 'OWNER', tenantId: 'tenant-9', email: 'owner9@a.com' });
    vi.spyOn(endpoints, 'listAppointments').mockResolvedValue({ appointments: [] });

    renderAgendaPage();

    await waitFor(() =>
      expect(endpoints.listAppointments).toHaveBeenCalledWith(
        'tenant-9',
        expect.any(Object),
        't9',
      ),
    );
  });

  // AC-18
  it('una persona con rol AGENT puede ver la agenda sin restriccion adicional', async () => {
    setSession({ token: 't2', role: 'AGENT', tenantId: 'tenant-1', email: 'agent@a.com' });
    vi.spyOn(endpoints, 'listAppointments').mockResolvedValue({ appointments: [] });

    renderAgendaPage();

    await waitFor(() => expect(endpoints.listAppointments).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(/no autorizad/i)).not.toBeInTheDocument();
  });

  // AC-19
  it('renderiza etiquetas de estado y filtros en espanol', async () => {
    vi.spyOn(endpoints, 'listAppointments').mockResolvedValue({
      appointments: [buildAppointment({ status: 'CONFIRMED', scheduledAt: '2026-07-25T10:00:00.000Z' })],
    });

    renderAgendaPage();

    const row = await screen.findByTestId('appointment-row');
    expect(within(row).getByText('Confirmada')).toBeInTheDocument();
    expect(screen.getByTestId('appointment-status-filter')).toBeInTheDocument();
  });
});
