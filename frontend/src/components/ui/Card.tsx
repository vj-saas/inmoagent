import { forwardRef, type HTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/cn';

/**
 * Card — contenedor heredado. Las pantallas rediseñadas usan `Slab`; esto
 * queda para las que todavía no se migraron, alineado al lenguaje nuevo
 * (esquina viva, sin sombra, jerarquía por regla) para que no convivan dos
 * estéticas mientras dura la migración.
 *
 * `bg-surface` en la variante neutral es contrato con `Card.test.tsx`.
 */
export const cardVariants = cva('border transition-colors duration-150', {
  variants: {
    tone: {
      /** Contenido estándar: papel con hairline. */
      neutral: 'border-border bg-surface',
      /** Énfasis: se distingue por una regla superior de tinta, no por elevación. */
      raised: 'border-border border-t-2 border-t-border-strong bg-surface',
    },
  },
  defaultVariants: {
    tone: 'neutral',
  },
});

export interface CardProps
  extends HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof cardVariants> {}

export const Card = forwardRef<HTMLDivElement, CardProps>(({ className, tone, ...props }, ref) => (
  <div ref={ref} className={cn(cardVariants({ tone }), className)} {...props} />
));
Card.displayName = 'Card';

export const CardHeader = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('border-b border-border px-4 py-3', className)} {...props} />
  ),
);
CardHeader.displayName = 'CardHeader';

export const CardBody = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} className={cn('p-4', className)} {...props} />,
);
CardBody.displayName = 'CardBody';
