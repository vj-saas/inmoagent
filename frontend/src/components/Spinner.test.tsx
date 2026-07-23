import { beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { Spinner } from './Spinner';

describe('Spinner Component', () => {
  beforeEach(() => {
    cleanup();
  });

  it('renders the spinner indicator', () => {
    render(<Spinner />);
    const spinner = screen.getByTestId('spinner');
    expect(spinner).toBeInTheDocument();
  });

  it('displays default loading text', () => {
    render(<Spinner />);
    expect(screen.getByText('Cargando...')).toBeInTheDocument();
  });

  it('displays custom text when provided', () => {
    const customText = 'Procesando solicitud...';
    render(<Spinner text={customText} />);
    expect(screen.getByText(customText)).toBeInTheDocument();
  });

  it('renders the spinner with visible indicator', () => {
    render(<Spinner />);
    const spinner = screen.getByTestId('spinner');
    expect(spinner).toBeVisible();
  });
});
