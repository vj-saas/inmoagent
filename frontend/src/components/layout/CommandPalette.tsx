import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { Meta } from '../ui/Meta';
import { cn } from '../../lib/cn';
import { visibleNavGroups, type NavEntry } from './nav-items';

export interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Paleta de comandos (⌘K / Ctrl+K).
 *
 * El índice numerado del rail le da personalidad al panel; esta paleta es lo
 * que le devuelve la velocidad al operador que entra 40 veces por día. Se
 * puede navegar tipeando el nombre de la sección o su número ("02" →
 * Llamar hoy).
 *
 * No se monta cuando está cerrada: así el índice de navegación existe una
 * sola vez en el DOM y las búsquedas por texto de los tests nunca se topan
 * con dos copias del mismo label.
 */
export function CommandPalette({ open, onClose }: CommandPaletteProps): JSX.Element | null {
  const navigate = useNavigate();
  const { person } = useAuth();
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const entries: NavEntry[] = useMemo(
    () => visibleNavGroups(person?.role).flatMap((group) => group.entries),
    [person?.role],
  );

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return entries;
    return entries.filter(
      (entry) =>
        entry.label.toLowerCase().includes(needle) ||
        entry.hint.toLowerCase().includes(needle) ||
        entry.index === needle,
    );
  }, [entries, query]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setCursor(0);
      inputRef.current?.focus();
    }
  }, [open]);

  if (!open) return null;

  const go = (entry: NavEntry | undefined): void => {
    if (!entry) return;
    navigate(entry.to);
    onClose();
  };

  const handleKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      onClose();
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setCursor((c) => (results.length ? (c + 1) % results.length : 0));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setCursor((c) => (results.length ? (c - 1 + results.length) % results.length : 0));
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      go(results[cursor]);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-overlay px-4 pt-[12vh]"
      onClick={onClose}
      data-testid="command-palette"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Buscar sección"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={handleKeyDown}
        className="w-full max-w-xl border-2 border-border-strong bg-surface"
      >
        <div className="flex items-center gap-3 border-b-2 border-border-strong px-4 py-3">
          <Meta className="text-accent">Ir a</Meta>
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setCursor(0);
            }}
            placeholder="Sección o número…"
            aria-label="Buscar sección"
            className="w-full bg-transparent font-mono text-sm text-text placeholder:text-text-faint focus:outline-none"
          />
          <Meta className="shrink-0 border border-border px-1.5 py-0.5">ESC</Meta>
        </div>

        <ul className="max-h-[50vh] overflow-y-auto">
          {results.length === 0 && (
            <li className="px-4 py-6 text-center text-sm text-text-muted">
              Ninguna sección coincide con la búsqueda.
            </li>
          )}
          {results.map((entry, i) => (
            <li key={entry.to}>
              <button
                type="button"
                onMouseEnter={() => setCursor(i)}
                onClick={() => go(entry)}
                className={cn(
                  'flex w-full items-baseline gap-3 border-b border-border px-4 py-3 text-left',
                  i === cursor ? 'bg-invert text-on-invert' : 'text-text',
                )}
              >
                <span
                  className={cn(
                    'u-meta shrink-0',
                    i === cursor ? 'text-accent-loud' : 'text-text-faint',
                  )}
                >
                  {entry.index}
                </span>
                <span className="font-semibold tracking-tight">{entry.label}</span>
                <span
                  className={cn(
                    'ml-auto truncate font-mono text-xs',
                    i === cursor ? 'text-on-invert/70' : 'text-text-faint',
                  )}
                >
                  {entry.hint}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
