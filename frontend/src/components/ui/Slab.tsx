import { forwardRef, type HTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/cn';

/**
 * Slab — el contenedor del sistema. Reemplaza a `Card` en las pantallas
 * rediseñadas.
 *
 * La diferencia con una card no es cosmética: una card se define por su
 * elevación (radio + sombra + fondo flotando sobre el lienzo), un slab se
 * define por sus REGLAS. Esquina viva, sin sombra, y una regla superior de
 * 2px que es la que fija la jerarquía: `rule="ink"` para el bloque
 * protagonista de la pantalla, `rule="accent"` para lo que reclama acción,
 * `rule="none"` para contenido de apoyo.
 *
 * `tone="ink"` invierte el bloque completo (tinta con texto papel en claro,
 * papel con texto tinta en oscuro, vía los tokens `--color-invert` /
 * `--color-on-invert`) — es el recurso para el dato protagonista, no para
 * decorar.
 */
export const slabVariants = cva('relative', {
  variants: {
    tone: {
      /** Superficie de contenido: papel con hairline alrededor. */
      paper: 'border border-border bg-surface',
      /** Sin caja: solo el contenido sobre el lienzo, delimitado por su regla. */
      bare: 'bg-transparent',
      /** Bloque macizo invertido. El dato protagonista. */
      ink: 'bg-invert text-on-invert',
      /** Bloque macizo de acento. Solo para lo que exige una acción ahora. */
      accent: 'bg-accent-loud text-on-accent',
    },
    /** Regla superior: el único mecanismo de jerarquía entre slabs. */
    rule: {
      none: '',
      hairline: 'border-t border-t-border',
      ink: 'border-t-2 border-t-border-strong',
      accent: 'border-t-2 border-t-accent-loud',
    },
  },
  defaultVariants: {
    tone: 'paper',
    rule: 'none',
  },
});

export interface SlabProps
  extends HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof slabVariants> {}

export const Slab = forwardRef<HTMLDivElement, SlabProps>(
  ({ className, tone, rule, ...props }, ref) => (
    <div ref={ref} className={cn(slabVariants({ tone, rule }), className)} {...props} />
  ),
);
Slab.displayName = 'Slab';

/** Cabecera de slab: separada por hairline, nunca por cambio de fondo. */
export const SlabHead = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3',
        className,
      )}
      {...props}
    />
  ),
);
SlabHead.displayName = 'SlabHead';

export const SlabBody = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('p-4', className)} {...props} />
  ),
);
SlabBody.displayName = 'SlabBody';
