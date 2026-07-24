import { createRef } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from './Button';

describe('Button', () => {
  beforeEach(() => {
    cleanup();
  });

  it('renders children and defaults to variant primary / size md', () => {
    render(<Button>Guardar</Button>);
    const button = screen.getByRole('button', { name: 'Guardar' });
    expect(button).toBeInTheDocument();
    expect(button.className).toContain('bg-primary');
    expect(button.className).toContain('h-10');
  });

  it('applies the secondary/ghost/danger variant classes', () => {
    const { rerender } = render(<Button variant="secondary">Cancelar</Button>);
    expect(screen.getByRole('button', { name: 'Cancelar' }).className).toContain('bg-surface');

    rerender(<Button variant="ghost">Ghost</Button>);
    expect(screen.getByRole('button', { name: 'Ghost' }).className).toContain('bg-transparent');

    rerender(<Button variant="danger">Eliminar</Button>);
    expect(screen.getByRole('button', { name: 'Eliminar' }).className).toContain('bg-danger');
  });

  it('applies the sm size class', () => {
    render(<Button size="sm">Chico</Button>);
    expect(screen.getByRole('button', { name: 'Chico' }).className).toContain('h-9');
  });

  it('disables the button and shows a spinner when loading', () => {
    render(<Button loading>Enviando</Button>);
    const button = screen.getByRole('button', { name: 'Enviando' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByTestId('button-spinner')).toBeInTheDocument();
  });

  it('respects an explicit disabled prop', () => {
    render(<Button disabled>Deshabilitado</Button>);
    expect(screen.getByRole('button', { name: 'Deshabilitado' })).toBeDisabled();
  });

  it('merges a custom className and passes native props through', async () => {
    const handleClick = vi.fn();
    render(
      <Button className="my-custom-class" onClick={handleClick} type="submit">
        Confirmar
      </Button>
    );
    const button = screen.getByRole('button', { name: 'Confirmar' });
    expect(button.className).toContain('my-custom-class');
    expect(button).toHaveAttribute('type', 'submit');

    await userEvent.click(button);
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('forwards the ref to the underlying button element', () => {
    const ref = createRef<HTMLButtonElement>();
    render(<Button ref={ref}>Con ref</Button>);
    expect(ref.current).toBeInstanceOf(HTMLButtonElement);
  });
});
