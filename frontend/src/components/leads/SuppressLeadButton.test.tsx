import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import * as endpoints from '../../api/endpoints';
import { SuppressLeadButton } from './SuppressLeadButton';

const mockNavigate = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

describe('SuppressLeadButton', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function renderButton() {
    render(
      <MemoryRouter>
        <SuppressLeadButton tenantId="tenant-1" leadId="lead-1" token="tok" />
      </MemoryRouter>,
    );
  }

  it('no muestra el modal de confirmación al inicio', () => {
    renderButton();
    expect(screen.queryByTestId('suppress-lead-modal')).not.toBeInTheDocument();
  });

  it('el click inicial solo abre el modal, sin invocar suppressLead', async () => {
    const suppressSpy = vi.spyOn(endpoints, 'suppressLead');
    const user = userEvent.setup();

    renderButton();
    await user.click(screen.getByTestId('suppress-lead-open-modal'));

    expect(screen.getByTestId('suppress-lead-modal')).toBeInTheDocument();
    expect(suppressSpy).not.toHaveBeenCalled();
  });

  it('cancelar el modal no invoca suppressLead y lo cierra', async () => {
    const suppressSpy = vi.spyOn(endpoints, 'suppressLead');
    const user = userEvent.setup();

    renderButton();
    await user.click(screen.getByTestId('suppress-lead-open-modal'));
    await user.click(screen.getByTestId('suppress-lead-cancel'));

    expect(suppressSpy).not.toHaveBeenCalled();
    expect(screen.queryByTestId('suppress-lead-modal')).not.toBeInTheDocument();
  });

  it('confirmar invoca suppressLead y navega a /leads tras éxito', async () => {
    const suppressSpy = vi.spyOn(endpoints, 'suppressLead').mockResolvedValue({ deleted: true });
    const user = userEvent.setup();

    renderButton();
    await user.click(screen.getByTestId('suppress-lead-open-modal'));
    await user.click(screen.getByTestId('suppress-lead-confirm'));

    await waitFor(() => {
      expect(suppressSpy).toHaveBeenCalledWith('tenant-1', 'lead-1', 'tok');
    });
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/leads');
    });
  });

  it('si suppressLead falla, NO navega y mantiene el modal abierto', async () => {
    vi.spyOn(endpoints, 'suppressLead').mockRejectedValue(new Error('boom'));
    const user = userEvent.setup();

    renderButton();
    await user.click(screen.getByTestId('suppress-lead-open-modal'));
    await user.click(screen.getByTestId('suppress-lead-confirm'));

    await waitFor(() => {
      expect(screen.getByTestId('suppress-lead-error')).toBeInTheDocument();
    });
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(screen.getByTestId('suppress-lead-modal')).toBeInTheDocument();
  });
});
