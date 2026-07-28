import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import { cn } from '../../lib/cn';

export interface EmptyStateProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  icon?: ReactNode;
  title: string;
  message: string;
  /** `data-testid` configurable para reusar testids como `leads-empty` / `call-queue-empty`. */
  testId?: string;
}

/**
 * Estado vacío: una franja rayada (el "no hay nada acá" del sistema) sobre
 * papel, con el título en display chico. No usa ilustración: en una
 * herramienta de trabajo, el vacío es información, no un momento simpático.
 */
export const EmptyState = forwardRef<HTMLDivElement, EmptyStateProps>(
  ({ icon, title, message, testId = 'empty-state', className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('border border-border bg-surface', className)}
      data-testid={testId}
      {...props}
    >
      <div className="u-hatch h-8 border-b border-border" aria-hidden="true" />
      <div className="flex flex-col items-center justify-center gap-2 px-6 py-10 text-center">
        {icon && (
          <div className="text-2xl text-text-faint" aria-hidden="true">
            {icon}
          </div>
        )}
        <p className="u-display text-lg text-text">{title}</p>
        <p className="max-w-md text-sm text-text-muted">{message}</p>
      </div>
    </div>
  ),
);
EmptyState.displayName = 'EmptyState';
