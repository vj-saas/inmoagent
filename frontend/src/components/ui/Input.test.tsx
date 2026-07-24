import { createRef } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Input } from './Input';

describe('Input', () => {
  beforeEach(() => {
    cleanup();
  });

  it('does not wrap the label: getByLabelText finds it', () => {
    render(
      <div>
        <label htmlFor="email">Email</label>
        <Input id="email" />
      </div>
    );
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
  });

  it('passes native props through (value, onChange, placeholder)', async () => {
    render(<Input aria-label="Buscar" placeholder="Buscar..." defaultValue="" />);
    const input = screen.getByLabelText('Buscar') as HTMLInputElement;
    expect(input).toHaveAttribute('placeholder', 'Buscar...');

    await userEvent.type(input, 'hola');
    expect(input.value).toBe('hola');
  });

  it('marks aria-invalid and applies the danger border when invalid', () => {
    render(<Input aria-label="Campo" invalid />);
    const input = screen.getByLabelText('Campo');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input.className).toContain('border-danger');
  });

  it('merges a custom className with the default classes', () => {
    render(<Input aria-label="Campo" className="my-extra-class" />);
    const input = screen.getByLabelText('Campo');
    expect(input.className).toContain('my-extra-class');
    expect(input.className).toContain('rounded');
  });

  it('forwards the ref to the underlying input element', () => {
    const ref = createRef<HTMLInputElement>();
    render(<Input aria-label="Campo" ref={ref} />);
    expect(ref.current).toBeInstanceOf(HTMLInputElement);
  });
});
