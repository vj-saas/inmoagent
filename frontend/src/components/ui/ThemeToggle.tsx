import { useTheme, type ThemePreference } from '../../hooks/useTheme';
import { cn } from '../../lib/cn';

const ORDER: ThemePreference[] = ['light', 'dark', 'system'];

const LABELS: Record<ThemePreference, string> = {
  light: 'Tema claro',
  dark: 'Tema oscuro',
  system: 'Tema del sistema',
};

/**
 * Marca del modo activo: tres celdas, la vigente en bloque macizo. No hay
 * ícono de sol/luna — el estado se lee como un indicador de máquina, con las
 * tres opciones siempre a la vista en vez de escondidas en un ciclo opaco.
 */
const CELLS: Record<ThemePreference, string> = {
  light: 'CLR',
  dark: 'OSC',
  system: 'SIS',
};

export interface ThemeToggleProps {
  /** Rail colapsado: solo la celda activa. */
  compact?: boolean;
  className?: string;
}

export function ThemeToggle({ compact = false, className }: ThemeToggleProps) {
  const { preference, setTheme } = useTheme();

  function cycle() {
    setTheme(ORDER[(ORDER.indexOf(preference) + 1) % ORDER.length]);
  }

  return (
    <button
      type="button"
      onClick={cycle}
      title={LABELS[preference]}
      aria-label={`${LABELS[preference]} — tocar para cambiar`}
      className={cn('inline-flex border border-border', className)}
    >
      {ORDER.map((option) => {
        const active = option === preference;
        if (compact && !active) return null;
        return (
          <span
            key={option}
            aria-hidden="true"
            className={cn(
              'u-meta px-2 py-1.5',
              active ? 'bg-invert text-on-invert' : 'text-text-faint',
            )}
          >
            {CELLS[option]}
          </span>
        );
      })}
    </button>
  );
}
