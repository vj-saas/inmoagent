import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import { cn } from '../../lib/cn';

export interface EmptyStateProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  icon?: ReactNode;
  title: string;
  message: string;
  /** `data-testid` configurable para reusar testids como `leads-empty` / `call-queue-empty`. */
  testId?: string;
}

export const EmptyState = forwardRef<HTMLDivElement, EmptyStateProps>(
  ({ icon, title, message, testId = 'empty-state', className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'flex flex-col items-center justify-center gap-2 rounded-card border border-border bg-surface p-8 text-center',
        className
      )}
      data-testid={testId}
      {...props}
    >
      {icon && (
        <div className="text-3xl text-text-muted" aria-hidden="true">
          {icon}
        </div>
      )}
      <p className="text-base font-semibold text-text">{title}</p>
      <p className="text-sm text-text-muted">{message}</p>
    </div>
  )
);
EmptyState.displayName = 'EmptyState';
