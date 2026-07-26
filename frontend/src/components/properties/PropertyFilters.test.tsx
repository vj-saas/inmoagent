import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { PropertyFilters } from './PropertyFilters';

describe('PropertyFilters', () => {
  beforeEach(() => {
    cleanup();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('muestra el copy explicativo de precio sin conversión y de ambientes exactos', () => {
    render(<PropertyFilters onChange={vi.fn()} />);

    expect(screen.getByText(/sobre el valor numérico cargado/i)).toBeInTheDocument();
    expect(screen.getByText(/sin conversión de moneda/i)).toBeInTheDocument();
    expect(screen.getByText(/excluye las propiedades/i)).toBeInTheDocument();
  });

  it('el select de status dispara onChange inmediatamente con la forma esperada', () => {
    const onChange = vi.fn();
    render(<PropertyFilters onChange={onChange} />);

    fireEvent.change(screen.getByTestId('property-filter-status'), {
      target: { value: 'ACTIVE' },
    });

    expect(onChange).toHaveBeenCalledWith({ status: 'ACTIVE' });
  });

  it('el select de status vuelve a "Todos" emite status: undefined', () => {
    const onChange = vi.fn();
    render(<PropertyFilters onChange={onChange} />);

    fireEvent.change(screen.getByTestId('property-filter-status'), {
      target: { value: 'ACTIVE' },
    });
    fireEvent.change(screen.getByTestId('property-filter-status'), {
      target: { value: '' },
    });

    expect(onChange).toHaveBeenLastCalledWith({ status: undefined });
  });

  it('el select de operation dispara onChange inmediatamente', () => {
    const onChange = vi.fn();
    render(<PropertyFilters onChange={onChange} />);

    fireEvent.change(screen.getByTestId('property-filter-operation'), {
      target: { value: 'RENT' },
    });

    expect(onChange).toHaveBeenCalledWith({ operation: 'RENT' });
  });

  it('el select de rooms dispara onChange inmediatamente con un número', () => {
    const onChange = vi.fn();
    render(<PropertyFilters onChange={onChange} />);

    fireEvent.change(screen.getByTestId('property-filter-rooms'), {
      target: { value: '3' },
    });

    expect(onChange).toHaveBeenCalledWith({ rooms: 3 });
  });

  it('el select de rooms vuelto a "Cualquiera" emite rooms: undefined', () => {
    const onChange = vi.fn();
    render(<PropertyFilters onChange={onChange} />);

    fireEvent.change(screen.getByTestId('property-filter-rooms'), {
      target: { value: '3' },
    });
    fireEvent.change(screen.getByTestId('property-filter-rooms'), {
      target: { value: '' },
    });

    expect(onChange).toHaveBeenLastCalledWith({ rooms: undefined });
  });

  it('no dispara onChange en el mount inicial', () => {
    const onChange = vi.fn();
    render(<PropertyFilters onChange={onChange} />);

    vi.advanceTimersByTime(1000);

    expect(onChange).not.toHaveBeenCalled();
  });

  it('el input de búsqueda (q) se debouncea y no dispara un request por tecla', () => {
    const onChange = vi.fn();
    render(<PropertyFilters onChange={onChange} />);

    const input = screen.getByTestId('property-filter-q');
    fireEvent.change(input, { target: { value: 'd' } });
    fireEvent.change(input, { target: { value: 'de' } });
    fireEvent.change(input, { target: { value: 'dep' } });

    expect(onChange).not.toHaveBeenCalled();

    vi.advanceTimersByTime(300);

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({ q: 'dep' });
  });

  it('el input de barrio se debouncea', () => {
    const onChange = vi.fn();
    render(<PropertyFilters onChange={onChange} />);

    const input = screen.getByTestId('property-filter-neighborhood');
    fireEvent.change(input, { target: { value: 'Palermo' } });

    expect(onChange).not.toHaveBeenCalled();

    vi.advanceTimersByTime(300);

    expect(onChange).toHaveBeenCalledWith({ neighborhood: 'Palermo' });
  });

  it('limpiar el input de barrio emite neighborhood: undefined tras el debounce', () => {
    const onChange = vi.fn();
    render(<PropertyFilters onChange={onChange} />);

    const input = screen.getByTestId('property-filter-neighborhood');
    fireEvent.change(input, { target: { value: 'Palermo' } });
    vi.advanceTimersByTime(300);

    fireEvent.change(input, { target: { value: '' } });
    vi.advanceTimersByTime(300);

    expect(onChange).toHaveBeenLastCalledWith({ neighborhood: undefined });
  });

  it('minPrice y maxPrice se debouncean y emiten números', () => {
    const onChange = vi.fn();
    render(<PropertyFilters onChange={onChange} />);

    const minInput = screen.getByTestId('property-filter-min-price');
    const maxInput = screen.getByTestId('property-filter-max-price');

    fireEvent.change(minInput, { target: { value: '1' } });
    fireEvent.change(minInput, { target: { value: '10' } });
    fireEvent.change(minInput, { target: { value: '100' } });
    fireEvent.change(maxInput, { target: { value: '500' } });

    expect(onChange).not.toHaveBeenCalled();

    vi.advanceTimersByTime(300);

    expect(onChange).toHaveBeenCalledWith({ minPrice: 100 });
    expect(onChange).toHaveBeenCalledWith({ maxPrice: 500 });
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('vaciar minPrice emite minPrice: undefined', () => {
    const onChange = vi.fn();
    render(<PropertyFilters onChange={onChange} />);

    const minInput = screen.getByTestId('property-filter-min-price');
    fireEvent.change(minInput, { target: { value: '100' } });
    vi.advanceTimersByTime(300);

    fireEvent.change(minInput, { target: { value: '' } });
    vi.advanceTimersByTime(300);

    expect(onChange).toHaveBeenLastCalledWith({ minPrice: undefined });
  });

  it('resetea el timer de debounce en cada tecla (no dispara antes de tiempo)', () => {
    const onChange = vi.fn();
    render(<PropertyFilters onChange={onChange} />);

    const input = screen.getByTestId('property-filter-q');
    fireEvent.change(input, { target: { value: 'd' } });
    vi.advanceTimersByTime(200);
    fireEvent.change(input, { target: { value: 'de' } });
    vi.advanceTimersByTime(200);

    expect(onChange).not.toHaveBeenCalled();

    vi.advanceTimersByTime(100);

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({ q: 'de' });
  });
});
