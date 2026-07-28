import React from 'react';
import { Button } from './ui';

export interface PaginationProps {
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}

/**
 * Paginación: dos bloques y un contador tabular entre ellos, colgados de la
 * misma regla que cierra el ledger. Sin números de página sueltos ni flechas
 * decorativas — en una bandeja que se recorre de arriba hacia abajo, lo único
 * que se necesita saber es dónde se está parado.
 */
export const Pagination: React.FC<PaginationProps> = ({
  total,
  page,
  pageSize,
  onPageChange,
}) => {
  const totalPages = Math.ceil(total / pageSize);
  const isFirstPage = page === 1;
  const isLastPage = page === totalPages;
  const noPagesOrSinglePage = totalPages === 0 || totalPages === 1;

  const handlePrevious = () => {
    if (!isFirstPage && !noPagesOrSinglePage) {
      onPageChange(page - 1);
    }
  };

  const handleNext = () => {
    if (!isLastPage && !noPagesOrSinglePage) {
      onPageChange(page + 1);
    }
  };

  const isPreviousDisabled = isFirstPage || noPagesOrSinglePage;
  const isNextDisabled = isLastPage || noPagesOrSinglePage;

  return (
    <div className="flex items-center gap-4 py-4" data-testid="pagination">
      <Button
        variant="secondary"
        size="sm"
        onClick={handlePrevious}
        disabled={isPreviousDisabled}
        data-testid="pagination-previous-btn"
      >
        Anterior
      </Button>
      <span className="u-meta u-num text-text-muted" data-testid="pagination-text">
        Página {page} de {totalPages}
      </span>
      <Button
        variant="secondary"
        size="sm"
        onClick={handleNext}
        disabled={isNextDisabled}
        data-testid="pagination-next-btn"
      >
        Siguiente
      </Button>
    </div>
  );
};
