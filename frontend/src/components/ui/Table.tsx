import {
  forwardRef,
  type HTMLAttributes,
  type TdHTMLAttributes,
  type ThHTMLAttributes,
} from 'react';
import { cn } from '../../lib/cn';

/** Wrapper con `overflow-x-auto`: clave para que las tablas no generen scroll de página (AC-8). */
export const TableScroll = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('w-full overflow-x-auto', className)} {...props} />
  )
);
TableScroll.displayName = 'TableScroll';

export const Table = forwardRef<HTMLTableElement, HTMLAttributes<HTMLTableElement>>(
  ({ className, ...props }, ref) => (
    <table ref={ref} className={cn('w-full min-w-max border-collapse text-sm', className)} {...props} />
  )
);
Table.displayName = 'Table';

export const THead = forwardRef<
  HTMLTableSectionElement,
  HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <thead ref={ref} className={cn('bg-bg text-text-muted', className)} {...props} />
));
THead.displayName = 'THead';

export const TBody = forwardRef<
  HTMLTableSectionElement,
  HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tbody ref={ref} className={cn('divide-y divide-border', className)} {...props} />
));
TBody.displayName = 'TBody';

export const Tr = forwardRef<HTMLTableRowElement, HTMLAttributes<HTMLTableRowElement>>(
  ({ className, ...props }, ref) => <tr ref={ref} className={cn(className)} {...props} />
);
Tr.displayName = 'Tr';

export const Th = forwardRef<HTMLTableCellElement, ThHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => (
    <th ref={ref} className={cn('px-3 py-2 text-left font-medium', className)} {...props} />
  )
);
Th.displayName = 'Th';

export const Td = forwardRef<HTMLTableCellElement, TdHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => (
    <td ref={ref} className={cn('px-3 py-2 align-middle', className)} {...props} />
  )
);
Td.displayName = 'Td';
