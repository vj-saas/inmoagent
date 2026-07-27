import { forwardRef, type HTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/cn';

export const cardVariants = cva('rounded-card border transition-all duration-200', {
  variants: {
    tone: {
      /** Card de contenido estándar (listas, formularios, tablas). */
      neutral: 'border-border bg-surface shadow-sm hover:shadow-md hover:border-text/10',
      /** Énfasis: métricas, KPIs, elementos que deben destacar sobre el fondo. */
      raised: 'border-border bg-surface-raised shadow-md hover:shadow-lg',
    },
  },
  defaultVariants: {
    tone: 'neutral',
  },
});

export interface CardProps extends HTMLAttributes<HTMLDivElement>, VariantProps<typeof cardVariants> {}

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ className, tone, ...props }, ref) => (
    <div ref={ref} className={cn(cardVariants({ tone }), className)} {...props} />
  )
);
Card.displayName = 'Card';

export const CardHeader = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('border-b border-border px-4 py-3', className)} {...props} />
  )
);
CardHeader.displayName = 'CardHeader';

export const CardBody = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('p-4', className)} {...props} />
  )
);
CardBody.displayName = 'CardBody';
