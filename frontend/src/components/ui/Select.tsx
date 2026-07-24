import { forwardRef, type SelectHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean;
}

/** Select NATIVO estilado (no combobox custom): preserva `userEvent.selectOptions`. */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, invalid = false, children, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        'h-10 w-full rounded border bg-surface px-3 text-sm text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50',
        invalid ? 'border-danger' : 'border-border',
        className
      )}
      aria-invalid={invalid || undefined}
      {...props}
    >
      {children}
    </select>
  )
);
Select.displayName = 'Select';
