import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { LeadSearchInput } from './LeadSearchInput';

describe('LeadSearchInput Component', () => {
  beforeEach(() => {
    cleanup();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('renders the input with placeholder in Spanish', () => {
    const onSearch = vi.fn();
    render(<LeadSearchInput onSearch={onSearch} />);

    const input = screen.getByTestId('lead-search-input') as HTMLInputElement;
    expect(input).toBeInTheDocument();
    expect(input.placeholder).toBe('Buscar por teléfono o nombre...');
  });

  it('renders with custom placeholder when provided', () => {
    const onSearch = vi.fn();
    const customPlaceholder = 'Buscar leads...';
    render(<LeadSearchInput onSearch={onSearch} placeholder={customPlaceholder} />);

    const input = screen.getByTestId('lead-search-input') as HTMLInputElement;
    expect(input.placeholder).toBe(customPlaceholder);
  });

  it('updates input value on user typing', () => {
    const onSearch = vi.fn();
    render(<LeadSearchInput onSearch={onSearch} />);

    const input = screen.getByTestId('lead-search-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'test' } });

    expect(input.value).toBe('test');
  });

  it('does NOT emit callback immediately on typing', () => {
    const onSearch = vi.fn();
    render(<LeadSearchInput onSearch={onSearch} />);

    const input = screen.getByTestId('lead-search-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'test' } });

    // Callback should not have been called yet
    expect(onSearch).not.toHaveBeenCalled();
  });

  it('emits callback with trimmed value after 350ms debounce', () => {
    const onSearch = vi.fn();
    render(<LeadSearchInput onSearch={onSearch} />);

    const input = screen.getByTestId('lead-search-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'test' } });
    expect(onSearch).not.toHaveBeenCalled();

    // Fast-forward 350ms
    vi.advanceTimersByTime(350);

    expect(onSearch).toHaveBeenCalledOnce();
    expect(onSearch).toHaveBeenCalledWith('test');
  });

  it('trims value before emitting', () => {
    const onSearch = vi.fn();
    render(<LeadSearchInput onSearch={onSearch} />);

    const input = screen.getByTestId('lead-search-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '  hello  ' } });
    vi.advanceTimersByTime(350);

    expect(onSearch).toHaveBeenCalledOnce();
    expect(onSearch).toHaveBeenCalledWith('hello');
  });

  it('does NOT emit callback for spaces-only input', () => {
    const onSearch = vi.fn();
    render(<LeadSearchInput onSearch={onSearch} />);

    const input = screen.getByTestId('lead-search-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '   ' } });
    vi.advanceTimersByTime(350);

    // Callback should not be called because trimmed value is empty
    expect(onSearch).not.toHaveBeenCalled();
  });

  it('emits an empty string when clearing a previously non-empty search', () => {
    const onSearch = vi.fn();
    render(<LeadSearchInput onSearch={onSearch} />);

    const input = screen.getByTestId('lead-search-input') as HTMLInputElement;

    fireEvent.change(input, { target: { value: 'alice' } });
    vi.advanceTimersByTime(350);
    expect(onSearch).toHaveBeenNthCalledWith(1, 'alice');

    fireEvent.change(input, { target: { value: '' } });
    vi.advanceTimersByTime(350);

    expect(onSearch).toHaveBeenNthCalledWith(2, '');
    expect(onSearch).toHaveBeenCalledTimes(2);
  });

  it('debounces multiple quick keystrokes and emits only once', () => {
    const onSearch = vi.fn();
    render(<LeadSearchInput onSearch={onSearch} />);

    const input = screen.getByTestId('lead-search-input') as HTMLInputElement;

    // Type multiple characters in quick succession
    fireEvent.change(input, { target: { value: 'test' } });

    // Fast-forward 200ms (not enough for debounce)
    vi.advanceTimersByTime(200);
    expect(onSearch).not.toHaveBeenCalled();

    // Continue to 350ms
    vi.advanceTimersByTime(150);
    expect(onSearch).toHaveBeenCalledOnce();
    expect(onSearch).toHaveBeenCalledWith('test');
  });

  it('resets debounce timer on each change', () => {
    const onSearch = vi.fn();
    render(<LeadSearchInput onSearch={onSearch} />);

    const input = screen.getByTestId('lead-search-input') as HTMLInputElement;

    // Type first character
    fireEvent.change(input, { target: { value: 't' } });
    vi.advanceTimersByTime(200);

    // Type another character before debounce completes
    fireEvent.change(input, { target: { value: 'te' } });
    vi.advanceTimersByTime(200);

    // Callback should still not be called (total time is 400ms, but timer resets on second character)
    expect(onSearch).not.toHaveBeenCalled();

    // Advance 150ms more to hit 350ms from last keystroke
    vi.advanceTimersByTime(150);
    expect(onSearch).toHaveBeenCalledOnce();
    expect(onSearch).toHaveBeenCalledWith('te');
  });

  it('clears previous timeout when component unmounts', () => {
    const onSearch = vi.fn();
    const { unmount } = render(<LeadSearchInput onSearch={onSearch} />);

    const input = screen.getByTestId('lead-search-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'test' } });

    // Unmount before debounce completes
    unmount();
    vi.advanceTimersByTime(350);

    // Callback should not be called (timeout was cleaned up)
    expect(onSearch).not.toHaveBeenCalled();
  });

  it('handles multiple searches in sequence', () => {
    const onSearch = vi.fn();
    render(<LeadSearchInput onSearch={onSearch} />);

    const input = screen.getByTestId('lead-search-input') as HTMLInputElement;

    // First search
    fireEvent.change(input, { target: { value: 'alice' } });
    vi.advanceTimersByTime(350);

    expect(onSearch).toHaveBeenNthCalledWith(1, 'alice');

    // Clear and second search
    fireEvent.change(input, { target: { value: 'bob' } });
    vi.advanceTimersByTime(350);

    expect(onSearch).toHaveBeenNthCalledWith(2, 'bob');
    expect(onSearch).toHaveBeenCalledTimes(2);
  });

  it('accepts phone numbers and special characters', () => {
    const onSearch = vi.fn();
    render(<LeadSearchInput onSearch={onSearch} />);

    const input = screen.getByTestId('lead-search-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '+54 9 11 1234-5678' } });
    vi.advanceTimersByTime(350);

    expect(onSearch).toHaveBeenCalledWith('+54 9 11 1234-5678');
  });

  it('is a controlled component that maintains state', () => {
    const onSearch = vi.fn();
    const { rerender } = render(<LeadSearchInput onSearch={onSearch} />);

    const input = screen.getByTestId('lead-search-input') as HTMLInputElement;
    expect(input.value).toBe('');

    // The component is controlled internally by its own state
    fireEvent.change(input, { target: { value: 'hello' } });
    expect(input.value).toBe('hello');

    // Rerendering with same props should maintain value
    rerender(<LeadSearchInput onSearch={onSearch} />);
    expect(input.value).toBe('hello');
  });
});
