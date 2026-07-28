import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/cn';

/**
 * Botón del sistema: bloque rectangular con rótulo en versalita y tracking
 * abierto. Nada de píldoras, sombras ni escalados elásticos.
 *
 * El hover no aclara ni oscurece: INVIERTE. Es la misma microinteracción que
 * usan las filas del ledger y el índice de navegación, de modo que "algo va a
 * pasar si hago click acá" se comunica siempre con el mismo gesto.
 *
 * Los tokens `bg-primary` / `bg-surface` / `bg-transparent` / `bg-danger` de
 * cada variante son contrato con `Button.test.tsx`.
 */
export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 border-2 font-semibold uppercase tracking-[0.08em] transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-40',
  {
    variants: {
      variant: {
        primary:
          'border-primary bg-primary text-white hover:border-accent-loud hover:bg-accent-loud hover:text-on-accent',
        secondary: 'border-border-strong bg-surface text-text hover:bg-invert hover:text-on-invert',
        outline: 'border-accent bg-transparent text-accent hover:bg-accent hover:text-white',
        ghost: 'border-transparent bg-transparent text-text-muted hover:text-accent',
        danger: 'border-danger bg-danger text-white hover:bg-transparent hover:text-danger',
      },
      size: {
        sm: 'h-9 px-3 text-[0.6875rem]',
        md: 'h-10 px-4 text-xs',
        lg: 'h-12 px-6 text-sm',
        icon: 'h-10 w-10 p-0',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  loading?: boolean;
  /** Requerido cuando `size="icon"` para accesibilidad (no hay texto visible). */
  'aria-label'?: string;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, loading = false, disabled, children, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && (
        <span
          className="h-3.5 w-3.5 animate-spin border-2 border-current border-t-transparent"
          aria-hidden="true"
          data-testid="button-spinner"
        />
      )}
      {children}
    </button>
  ),
);
Button.displayName = 'Button';
