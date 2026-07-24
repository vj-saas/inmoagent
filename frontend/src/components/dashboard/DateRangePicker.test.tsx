import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DateRangePicker } from './DateRangePicker';

describe('DateRangePicker', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it('emits normalized ISO range on mount with initial values', () => {
    const onChange = vi.fn();
    render(<DateRangePicker initialFrom="2026-06-01" initialTo="2026-06-30" onChange={onChange} />);

    expect(onChange).toHaveBeenCalledTimes(1);
    const { from, to } = onChange.mock.calls[0][0];
    expect(new Date(from).getFullYear()).toBe(2026);
    expect(from.endsWith('.000Z') || new Date(from).getHours() === 0).toBeTruthy();
    expect(to).toBeDefined();
  });

  it('emits from/to normalized to start/end of local day on valid change', () => {
    const onChange = vi.fn();
    render(<DateRangePicker initialFrom="2026-06-01" initialTo="2026-06-30" onChange={onChange} />);
    onChange.mockClear();

    fireEvent.change(screen.getByTestId('date-range-from'), { target: { value: '2026-07-01' } });
    fireEvent.change(screen.getByTestId('date-range-to'), { target: { value: '2026-07-10' } });

    expect(onChange).toHaveBeenCalled();
    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1][0];

    const fromDate = new Date(lastCall.from);
    const toDate = new Date(lastCall.to);

    expect(fromDate.getHours()).toBe(0);
    expect(fromDate.getMinutes()).toBe(0);
    expect(fromDate.getSeconds()).toBe(0);
    expect(fromDate.getMilliseconds()).toBe(0);

    expect(toDate.getHours()).toBe(23);
    expect(toDate.getMinutes()).toBe(59);
    expect(toDate.getSeconds()).toBe(59);
    expect(toDate.getMilliseconds()).toBe(999);
  });

  it('does not emit onChange and marks invalid when from is after to', () => {
    const onChange = vi.fn();
    render(<DateRangePicker initialFrom="2026-06-01" initialTo="2026-06-30" onChange={onChange} />);
    onChange.mockClear();

    fireEvent.change(screen.getByTestId('date-range-from'), { target: { value: '2026-08-01' } });

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByTestId('date-range-picker')).toHaveAttribute('data-valid', 'false');
  });

  it('does not emit onChange and does not crash when the date input is cleared', () => {
    const onChange = vi.fn();
    const onValidityChange = vi.fn();
    render(
      <DateRangePicker
        initialFrom="2026-06-01"
        initialTo="2026-06-30"
        onChange={onChange}
        onValidityChange={onValidityChange}
      />,
    );
    onChange.mockClear();
    onValidityChange.mockClear();

    fireEvent.change(screen.getByTestId('date-range-from'), { target: { value: '' } });

    expect(onChange).not.toHaveBeenCalled();
    expect(onValidityChange).toHaveBeenCalledWith(false);
    expect(screen.getByTestId('date-range-picker')).toHaveAttribute('data-valid', 'false');
  });

  it('invokes onValidityChange with true/false as the range becomes valid/invalid', () => {
    const onValidityChange = vi.fn();
    render(
      <DateRangePicker
        initialFrom="2026-06-01"
        initialTo="2026-06-30"
        onChange={vi.fn()}
        onValidityChange={onValidityChange}
      />,
    );
    onValidityChange.mockClear();

    fireEvent.change(screen.getByTestId('date-range-from'), { target: { value: '2026-08-01' } });
    expect(onValidityChange).toHaveBeenLastCalledWith(false);

    fireEvent.change(screen.getByTestId('date-range-from'), { target: { value: '2026-06-15' } });
    expect(onValidityChange).toHaveBeenLastCalledWith(true);
  });

  it('renders labels in Spanish', () => {
    render(<DateRangePicker initialFrom="2026-06-01" initialTo="2026-06-30" onChange={vi.fn()} />);
    expect(screen.getByText('Desde')).toBeInTheDocument();
    expect(screen.getByText('Hasta')).toBeInTheDocument();
  });
});
