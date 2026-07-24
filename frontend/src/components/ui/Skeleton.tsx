import { forwardRef, type HTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/cn';

export const skeletonVariants = cva('animate-pulse bg-border/60', {
  variants: {
    variant: {
      text: 'h-4 w-full rounded-sm',
      row: 'h-10 w-full rounded-sm',
      card: 'h-32 w-full rounded-card',
    },
  },
  defaultVariants: {
    variant: 'text',
  },
});

export interface SkeletonProps
  extends HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof skeletonVariants> {
  'data-testid'?: string;
}

export const Skeleton = forwardRef<HTMLDivElement, SkeletonProps>(
  ({ className, variant, 'data-testid': dataTestId, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(skeletonVariants({ variant }), className)}
      data-testid={dataTestId ?? 'skeleton'}
      {...props}
    />
  )
);
Skeleton.displayName = 'Skeleton';
