import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Modal } from './Modal';

describe('Modal', () => {
  beforeEach(() => {
    cleanup();
  });

  it('does not render anything when open is false', () => {
    render(
      <Modal open={false} onClose={() => {}} title="Confirmar">
        <button type="button">Aceptar</button>
      </Modal>
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders role="dialog" and aria-modal="true" when open', () => {
    render(
      <Modal open onClose={() => {}} title="Confirmar">
        <button type="button">Aceptar</button>
      </Modal>
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });

  it('focuses the first focusable control on open', () => {
    render(
      <Modal open onClose={() => {}} title="Confirmar">
        <button type="button">Aceptar</button>
      </Modal>
    );
    expect(screen.getByRole('button', { name: 'Aceptar' })).toHaveFocus();
  });

  it('calls onClose when Escape is pressed', async () => {
    const handleClose = vi.fn();
    render(
      <Modal open onClose={handleClose} title="Confirmar">
        <button type="button">Aceptar</button>
      </Modal>
    );
    await userEvent.keyboard('{Escape}');
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when clicking on the overlay (outside the dialog content)', async () => {
    const handleClose = vi.fn();
    render(
      <Modal open onClose={handleClose} title="Confirmar">
        <button type="button">Aceptar</button>
      </Modal>
    );
    await userEvent.click(screen.getByTestId('modal-overlay'));
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('does not call onClose when clicking inside the dialog content', async () => {
    const handleClose = vi.fn();
    render(
      <Modal open onClose={handleClose} title="Confirmar">
        <button type="button">Aceptar</button>
      </Modal>
    );
    await userEvent.click(screen.getByRole('button', { name: 'Aceptar' }));
    expect(handleClose).not.toHaveBeenCalled();
  });
});
