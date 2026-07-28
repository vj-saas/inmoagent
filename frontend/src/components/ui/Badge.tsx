import { forwardRef, type HTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/cn';

/**
 * Badge: rótulo rectangular en monoespaciada, no una píldora pastel.
 *
 * El tono no pinta un fondo lavado y nada más — el borde izquierdo grueso es
 * el que carga la señal, para que un estado se lea también en escala de
 * grises y a 375px de ancho. Las clases de color (`bg-bg`, `text-info`,
 * `text-success`, `text-warning`, `text-danger`) son contrato con
 * `Badge.test.tsx`.
 */
export const badgeVariants = cva(
  'u-meta inline-flex items-center gap-1 border border-l-4 px-2 py-1',
  {
    variants: {
      tone: {
        neutral: 'border-border border-l-text-faint bg-bg text-text-muted',
        info: 'border-info/30 border-l-info bg-info/10 text-info',
        success: 'border-success/30 border-l-success bg-success/10 text-success',
        warning: 'border-warning/30 border-l-warning bg-warning/10 text-warning',
        danger: 'border-danger/30 border-l-danger bg-danger/10 text-danger',
      },
    },
    defaultVariants: {
      tone: 'neutral',
    },
  },
);

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, tone, ...props }, ref) => (
    <span ref={ref} className={cn(badgeVariants({ tone }), className)} {...props} />
  ),
);
Badge.displayName = 'Badge';
