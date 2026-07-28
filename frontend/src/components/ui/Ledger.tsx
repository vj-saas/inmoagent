import { forwardRef, type HTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

/**
 * Ledger — el patrón de lista del sistema. Reemplaza la pila de cards.
 *
 * Un libro mayor, no una grilla de tarjetas: filas separadas por hairline,
 * sin espacio entre ellas, sin sombra, sin radio. La densidad es una feature
 * (el operador escanea 40 leads, no 6 tarjetas), y la jerarquía la dan tres
 * cosas: la barra maciza de señal a la izquierda, las cifras tabulares
 * alineadas en columna, y la inversión completa de la fila al hacer hover.
 *
 * La inversión (`hover:bg-invert`) es deliberadamente brusca: el feedback es
 * un cambio de estado, no un efecto. Nada se levanta ni se desenfoca.
 */
export type LedgerSignal = 'critical' | 'warning' | 'ok' | 'idle';

const SIGNAL_BAR: Record<LedgerSignal, string> = {
  critical: 'bg-danger',
  warning: 'bg-warning',
  ok: 'bg-success',
  idle: 'bg-border',
};

export const Ledger = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('border-t-2 border-border-strong border-b border-b-border', className)}
      {...props}
    />
  ),
);
Ledger.displayName = 'Ledger';

export interface LedgerRowProps extends HTMLAttributes<HTMLDivElement> {
  /** Barra maciza a la izquierda. Es el indicador de urgencia del sistema. */
  signal?: LedgerSignal;
  /** Fila seleccionada: queda invertida de forma permanente. */
  active?: boolean;
  /** Desactiva la inversión al hover (filas no accionables). */
  inert?: boolean;
}

/**
 * Fila del ledger. Los hijos que tengan color propio apagado deben llevar
 * `group-hover:text-inherit` para acompañar la inversión — está resuelto así
 * (y no con un `[&_*]` global) para que un color semántico que SÍ tiene que
 * sobrevivir a la inversión pueda hacerlo explícitamente.
 */
export const LedgerRow = forwardRef<HTMLDivElement, LedgerRowProps>(
  ({ className, signal = 'idle', active = false, inert = false, children, ...props }, ref) => (
    <div
      ref={ref}
      data-signal={signal}
      className={cn(
        'group relative border-b border-border pl-4 pr-3 py-3.5 sm:pl-6',
        active
          ? 'bg-invert text-on-invert'
          : !inert && 'hover:bg-invert hover:text-on-invert',
        className,
      )}
      {...props}
    >
      <span
        aria-hidden="true"
        className={cn('absolute inset-y-0 left-0 w-1.5 sm:w-2', SIGNAL_BAR[signal])}
      />
      {children}
    </div>
  ),
);
LedgerRow.displayName = 'LedgerRow';

/** Encabezado de columnas del ledger. Solo visible en desktop. */
export const LedgerHead = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'hidden items-center gap-4 border-b border-border pl-6 pr-3 py-2 text-text-faint md:flex',
        className,
      )}
      {...props}
    />
  ),
);
LedgerHead.displayName = 'LedgerHead';
