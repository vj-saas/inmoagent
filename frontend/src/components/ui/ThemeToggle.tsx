import { Moon, Sun, Monitor } from 'lucide-react';
import { useTheme, type ThemePreference } from '../../hooks/useTheme';
import { cn } from '../../lib/cn';

const ORDER: ThemePreference[] = ['light', 'dark', 'system'];

const ICONS: Record<ThemePreference, typeof Sun> = {
  light: Sun,
  dark: Moon,
  system: Monitor,
};

const LABELS: Record<ThemePreference, string> = {
  light: 'Tema claro',
  dark: 'Tema oscuro',
  system: 'Tema del sistema',
};

export interface ThemeToggleProps {
  /** Sidebar colapsado: solo ícono, sin label de texto. */
  compact?: boolean;
  className?: string;
}

export function ThemeToggle({ compact = false, className }: ThemeToggleProps) {
  const { preference, setTheme } = useTheme();
  const Icon = ICONS[preference];

  function cycle() {
    const next = ORDER[(ORDER.indexOf(preference) + 1) % ORDER.length];
    setTheme(next);
  }

  return (
    <button
      type="button"
      onClick={cycle}
      title={LABELS[preference]}
      aria-label={`${LABELS[preference]} — tocar para cambiar`}
      className={cn(
        'inline-flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-sm font-medium text-text-muted transition-colors hover:bg-bg hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40',
        compact && 'w-10 justify-center px-0 py-2',
        className
      )}
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
      {!compact && <span>{LABELS[preference]}</span>}
    </button>
  );
}
