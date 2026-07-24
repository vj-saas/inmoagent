import React, { useState, useEffect, useRef } from 'react';

export interface LeadSearchInputProps {
  /** Callback emitted after debounce (~350ms) with trimmed search term.
   *  Empty string (from spaces-only input) is NOT emitted. */
  onSearch: (q: string) => void;
  /** Placeholder text in Spanish. */
  placeholder?: string;
}

/**
 * Controlled text input with local debounce (~350ms) for lead search.
 * Emits the search term via `onSearch` callback after debounce completes.
 * Spaces-only values are trimmed to empty string and NOT emitted.
 *
 * Usage:
 * ```tsx
 * const [q, setQ] = useState('');
 * const handleSearch = (term: string) => {
 *   setQ(term);
 *   // make API call
 * };
 * <LeadSearchInput onSearch={handleSearch} />
 * ```
 */
export const LeadSearchInput: React.FC<LeadSearchInputProps> = ({
  onSearch,
  placeholder = 'Buscar por teléfono o nombre...',
}) => {
  const [value, setValue] = useState('');
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Tracks whether the last emitted term was non-empty, so clearing an
  // existing search emits '' (to reset the filter) while an initial
  // spaces-only input never emits at all.
  const hadContentRef = useRef(false);

  useEffect(() => {
    // Clear existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Set new timeout for debounce
    timeoutRef.current = setTimeout(() => {
      const trimmedValue = value.trim();
      if (trimmedValue.length > 0) {
        hadContentRef.current = true;
        onSearch(trimmedValue);
      } else if (hadContentRef.current) {
        // The user cleared a previously non-empty search: emit '' so the
        // consumer knows to drop the search filter, instead of leaving it
        // stuck on the last non-empty term.
        hadContentRef.current = false;
        onSearch('');
      }
    }, 350);

    // Cleanup: cancel timeout on unmount or on value change
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [value, onSearch]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setValue(e.target.value);
  };

  return (
    <input
      type="text"
      value={value}
      onChange={handleChange}
      placeholder={placeholder}
      data-testid="lead-search-input"
      style={{
        padding: '8px 12px',
        fontSize: '14px',
        border: '1px solid #ccc',
        borderRadius: '4px',
        width: '100%',
        boxSizing: 'border-box',
      }}
    />
  );
};
