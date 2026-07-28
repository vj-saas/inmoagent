import { forwardRef, type HTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

export interface MetaProps extends HTMLAttributes<HTMLSpanElement> {
  /** Renderiza como `<div>` cuando la etiqueta encabeza un bloque. */
  as?: 'span' | 'div';
  /** Etiqueta apagada (metadato de apoyo) vs. plena (rótulo estructural). */
  muted?: boolean;
}

/**
 * Meta — la etiqueta del sistema: mono, 11px, versalita con tracking abierto.
 *
 * Regla de la dirección de arte: toda etiqueta, rótulo de columna, unidad y
 * estado va acá. Es lo que sostiene el contraste con la tipografía display:
 * el titular grita, el metadato susurra en monoespaciada.
 */
export const Meta = forwardRef<HTMLSpanElement, MetaProps>(
  ({ className, as = 'span', muted = true, ...props }, ref) => {
    const Component = as;
    return (
      <Component
        // @ts-expect-error el ref cambia de tipo según `as`; ambos son HTMLElement
        ref={ref}
        className={cn('u-meta', muted ? 'text-text-faint' : 'text-text', className)}
        {...props}
      />
    );
  },
);
Meta.displayName = 'Meta';
