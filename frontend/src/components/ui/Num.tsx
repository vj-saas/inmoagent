import { forwardRef, type HTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/cn';

/**
 * Num — todo número que el usuario compara o lee de un vistazo.
 *
 * Dos registros, una sola regla (cifras tabulares siempre, para que las
 * columnas alineen y un número no "baile" al actualizarse):
 *
 * - `hero` / `display`: Archivo estirado, el número como titular editorial.
 *   Es el protagonista del panel, no un dato más dentro de una card.
 * - `data`: IBM Plex Mono. Teléfonos, precios, contadores, timers — todo lo
 *   que vive dentro de una fila del ledger.
 *
 * La animación de entrada revela por máscara (no cuenta de 0 al valor): el
 * DOM muestra la cifra final desde el primer frame, así un lector de
 * pantalla —o un test— nunca lee un número intermedio que no existe.
 */
export const numVariants = cva('u-num inline-block', {
  variants: {
    variant: {
      hero: 'u-display text-[clamp(3.5rem,9vw,6.5rem)]',
      display: 'u-display text-[clamp(1.75rem,4vw,2.75rem)]',
      data: 'font-mono font-medium',
    },
  },
  defaultVariants: {
    variant: 'data',
  },
});

export interface NumProps
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof numVariants> {
  /** Revelado por máscara al montar. Desactivado por `prefers-reduced-motion`. */
  reveal?: boolean;
}

export const Num = forwardRef<HTMLSpanElement, NumProps>(
  ({ className, variant, reveal = false, ...props }, ref) => (
    <span
      ref={ref}
      className={cn(numVariants({ variant }), reveal && 'u-reveal', className)}
      {...props}
    />
  ),
);
Num.displayName = 'Num';
