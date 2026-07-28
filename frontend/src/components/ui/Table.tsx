import {
  forwardRef,
  type HTMLAttributes,
  type TdHTMLAttributes,
  type ThHTMLAttributes,
} from 'react';
import { cn } from '../../lib/cn';

/**
 * Tabla del sistema, en el mismo lenguaje que `Ledger`: regla de tinta arriba,
 * hairlines entre filas y encabezados en monoespaciada versalita. Se mantiene
 * como `<table>` real —y no como divs— donde el dato es genuinamente tabular
 * (agenda, personas, propiedades): es mejor para lectores de pantalla y para
 * navegar con teclado.
 *
 * A diferencia de `LedgerRow`, la fila NO se invierte al hover: estas tablas
 * llevan botones y formularios adentro, y la inversión les rompería el
 * contraste. Acá el hover es solo un cambio de superficie.
 */

/** Wrapper con `overflow-x-auto`: clave para que las tablas no generen scroll de página (AC-8). */
export const TableScroll = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('w-full overflow-x-auto', className)} {...props} />
  ),
);
TableScroll.displayName = 'TableScroll';

export const Table = forwardRef<HTMLTableElement, HTMLAttributes<HTMLTableElement>>(
  ({ className, ...props }, ref) => (
    <table
      ref={ref}
      className={cn(
        'w-full min-w-max border-collapse border-t-2 border-border-strong text-sm',
        className,
      )}
      {...props}
    />
  ),
);
Table.displayName = 'Table';

export const THead = forwardRef<HTMLTableSectionElement, HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <thead ref={ref} className={cn('border-b border-border text-text-faint', className)} {...props} />
  ),
);
THead.displayName = 'THead';

export const TBody = forwardRef<HTMLTableSectionElement, HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <tbody ref={ref} className={cn('divide-y divide-border', className)} {...props} />
  ),
);
TBody.displayName = 'TBody';

export const Tr = forwardRef<HTMLTableRowElement, HTMLAttributes<HTMLTableRowElement>>(
  ({ className, ...props }, ref) => (
    <tr ref={ref} className={cn('group transition-colors hover:bg-surface', className)} {...props} />
  ),
);
Tr.displayName = 'Tr';

export const Th = forwardRef<HTMLTableCellElement, ThHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => (
    <th ref={ref} className={cn('u-meta px-4 py-2.5 text-left', className)} {...props} />
  ),
);
Th.displayName = 'Th';

export const Td = forwardRef<HTMLTableCellElement, TdHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => (
    <td ref={ref} className={cn('px-4 py-3.5 align-middle', className)} {...props} />
  ),
);
Td.displayName = 'Td';
