import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

/**
 * Input nativo, sin envolver el label: los tests usan `getByLabelText`.
 *
 * Campo rectangular con hairline; al enfocar, el borde pasa a tinta plena y
 * el contorno de foco global (2px sólido con offset) hace el resto. El valor
 * se tipea en monoespaciada porque casi todo lo que se carga acá es dato
 * (teléfonos, precios, fechas, claves).
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, invalid = false, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'h-10 w-full rounded-none border bg-surface px-3 font-mono text-sm text-text placeholder:font-sans placeholder:text-text-faint focus-visible:border-border-strong disabled:cursor-not-allowed disabled:opacity-40',
        invalid ? 'border-danger' : 'border-border',
        className,
      )}
      aria-invalid={invalid || undefined}
      {...props}
    />
  ),
);
Input.displayName = 'Input';
