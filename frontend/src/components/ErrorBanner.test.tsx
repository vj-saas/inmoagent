import { beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { ErrorBanner } from './ErrorBanner';

describe('ErrorBanner Component', () => {
  beforeEach(() => {
    cleanup();
  });

  it('renders the error banner', () => {
    render(<ErrorBanner message="Error al cargar datos" />);
    const banner = screen.getByTestId('error-banner');
    expect(banner).toBeInTheDocument();
  });

  it('displays the error message passed as prop', () => {
    const errorMessage = 'Credenciales inválidas. Intente nuevamente.';
    render(<ErrorBanner message={errorMessage} />);
    expect(screen.getByText(errorMessage)).toBeInTheDocument();
  });

  it('has the alert role for accessibility', () => {
    render(<ErrorBanner message="Error de permisos" />);
    const banner = screen.getByRole('alert');
    expect(banner).toBeInTheDocument();
  });

  it('renders different error messages correctly', () => {
    const { rerender } = render(<ErrorBanner message="Primer error" />);
    expect(screen.getByText('Primer error')).toBeInTheDocument();

    rerender(<ErrorBanner message="Segundo error" />);
    expect(screen.getByText('Segundo error')).toBeInTheDocument();
  });

  it('banner is visible', () => {
    render(<ErrorBanner message="Error visible" />);
    const banner = screen.getByTestId('error-banner');
    expect(banner).toBeVisible();
  });
});
