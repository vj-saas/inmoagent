import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider, useToast } from './Toast';

function ToastTrigger() {
  const { showToast } = useToast();
  return (
    <button type="button" onClick={() => showToast('Guardado con éxito', 'success')}>
      Disparar toast
    </button>
  );
}

describe('Toast', () => {
  beforeEach(() => {
    cleanup();
  });

  it('useToast() without a provider is a silent no-op', async () => {
    render(<ToastTrigger />);
    const button = screen.getByRole('button', { name: 'Disparar toast' });
    await expect(userEvent.click(button)).resolves.not.toThrow();
  });

  it('renders an aria-live="polite" region', () => {
    render(
      <ToastProvider>
        <div>contenido</div>
      </ToastProvider>
    );
    expect(screen.getByTestId('toast-region')).toHaveAttribute('aria-live', 'polite');
  });

  it('shows a toast message when showToast is called through the provider', async () => {
    render(
      <ToastProvider>
        <ToastTrigger />
      </ToastProvider>
    );
    await userEvent.click(screen.getByRole('button', { name: 'Disparar toast' }));
    expect(screen.getByText('Guardado con éxito')).toBeInTheDocument();
  });

  it('auto-dismisses the toast after the configured duration', async () => {
    vi.useFakeTimers();
    render(
      <ToastProvider duration={1000}>
        <ToastTrigger />
      </ToastProvider>
    );

    await act(async () => {
      screen.getByRole('button', { name: 'Disparar toast' }).click();
    });
    expect(screen.getByText('Guardado con éxito')).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.queryByText('Guardado con éxito')).not.toBeInTheDocument();
    vi.useRealTimers();
  });
});
