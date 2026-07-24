import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

/** Input nativo, sin envolver el label: los tests usan `getByLabelText`. */
export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, invalid = false, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'h-10 w-full rounded border bg-surface px-3 text-sm text-text placeholder:text-text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50',
        invalid ? 'border-danger' : 'border-border',
        className
      )}
      aria-invalid={invalid || undefined}
      {...props}
    />
  )
);
Input.displayName = 'Input';
