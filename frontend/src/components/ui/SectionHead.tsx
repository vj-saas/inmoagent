import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { Meta } from './Meta';

export interface SectionHeadProps {
  /** Número de sección del índice de navegación ("01", "02", ...). */
  index?: string;
  title: string;
  /** Bajada editorial. Una línea, en tono apagado. */
  description?: string;
  /** Dato de contexto a la derecha del número (rango, total, hora de corte). */
  kicker?: ReactNode;
  /** Controles de la sección (filtros, rango de fechas, acciones). */
  actions?: ReactNode;
  className?: string;
}

/**
 * Encabezado de página. Es la pieza que fija el tono editorial de toda la app:
 * el número de sección en mono a la izquierda, el título en Archivo estirado
 * a tamaño de titular, y una regla de 2px que cierra el bloque.
 *
 * No hay breadcrumb ni tabs internas (ver INFORMATION_ARCHITECTURE.md): la
 * ubicación se comunica con el número, que es el mismo del índice del rail.
 */
export function SectionHead({
  index,
  title,
  description,
  kicker,
  actions,
  className,
}: SectionHeadProps): JSX.Element {
  return (
    <header className={cn('border-b-2 border-border-strong pb-4', className)}>
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
        <div className="min-w-0">
          <div className="flex items-baseline gap-3">
            {index && (
              <span className="u-meta text-accent" aria-hidden="true">
                {index}
              </span>
            )}
            {kicker && <Meta>{kicker}</Meta>}
          </div>

          <h1 className="u-display mt-2 text-[clamp(2rem,5.5vw,3.5rem)] text-text">{title}</h1>

          {description && (
            <p className="mt-2 max-w-2xl text-sm text-text-muted">{description}</p>
          )}
        </div>

        {actions && <div className="flex shrink-0 flex-wrap items-end gap-3">{actions}</div>}
      </div>
    </header>
  );
}
