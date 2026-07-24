import { createRef } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Select } from './Select';

describe('Select', () => {
  beforeEach(() => {
    cleanup();
  });

  it('preserves userEvent.selectOptions on a native select', async () => {
    const handleChange = vi.fn();

    function Wrapper() {
      return (
        <div>
          <label htmlFor="state">Estado</label>
          <Select id="state" onChange={handleChange}>
            <option value="nuevo">Nuevo</option>
            <option value="contactado">Contactado</option>
          </Select>
        </div>
      );
    }

    render(<Wrapper />);
    const select = screen.getByLabelText('Estado') as HTMLSelectElement;
    await userEvent.selectOptions(select, 'contactado');
    expect(select.value).toBe('contactado');
    expect(handleChange).toHaveBeenCalled();
  });

  it('marks aria-invalid when invalid', () => {
    render(
      <Select aria-label="Filtro" invalid>
        <option value="a">A</option>
      </Select>
    );
    expect(screen.getByLabelText('Filtro')).toHaveAttribute('aria-invalid', 'true');
  });

  it('merges a custom className', () => {
    render(
      <Select aria-label="Filtro" className="my-select-class">
        <option value="a">A</option>
      </Select>
    );
    expect(screen.getByLabelText('Filtro').className).toContain('my-select-class');
  });

  it('forwards the ref to the underlying select element', () => {
    const ref = createRef<HTMLSelectElement>();
    render(
      <Select aria-label="Filtro" ref={ref}>
        <option value="a">A</option>
      </Select>
    );
    expect(ref.current).toBeInstanceOf(HTMLSelectElement);
  });
});
