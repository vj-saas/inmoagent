import type { ReactNode } from 'react';
import { Spinner } from '../Spinner';
import { ErrorBanner } from '../ErrorBanner';
import { EmptyState } from './EmptyState';

export interface AsyncSectionProps {
  loading: boolean;
  /** Mensaje ya formateado en español (típicamente vía el `errorMessage()` local de cada página). */
  error?: string | null;
  isEmpty?: boolean;
  skeleton?: ReactNode;
  loadingLabel?: string;
  emptyIcon?: ReactNode;
  emptyTitle?: string;
  emptyMessage?: string;
  emptyTestId?: string;
  children: ReactNode;
}

/**
 * Patrón único de render mutuamente excluyente: loading -> error -> empty ->
 * children, en ese orden.
 */
export function AsyncSection({
  loading,
  error,
  isEmpty = false,
  skeleton,
  loadingLabel = 'Cargando...',
  emptyIcon,
  emptyTitle = 'No hay resultados',
  emptyMessage = 'No se encontraron elementos para mostrar.',
  emptyTestId,
  children,
}: AsyncSectionProps) {
  if (loading) {
    return skeleton ? <>{skeleton}</> : <Spinner text={loadingLabel} />;
  }

  if (error) {
    return <ErrorBanner message={error} />;
  }

  if (isEmpty) {
    return (
      <EmptyState icon={emptyIcon} title={emptyTitle} message={emptyMessage} testId={emptyTestId} />
    );
  }

  return <>{children}</>;
}
