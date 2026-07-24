import React from 'react';

export interface PaginationProps {
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}

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

  const buttonStyles: React.CSSProperties = {
    padding: '8px 16px',
    marginRight: '8px',
    border: '1px solid #ccc',
    borderRadius: '4px',
    backgroundColor: '#fff',
    cursor: 'pointer',
    fontSize: '14px',
    fontFamily: 'inherit',
  };

  const disabledButtonStyles: React.CSSProperties = {
    ...buttonStyles,
    opacity: 0.5,
    cursor: 'not-allowed',
    backgroundColor: '#f5f5f5',
  };

  const containerStyles: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    padding: '16px 0',
  };

  const textStyles: React.CSSProperties = {
    fontSize: '14px',
    color: '#666',
  };

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
    <div style={containerStyles} data-testid="pagination">
      <button
        onClick={handlePrevious}
        disabled={isPreviousDisabled}
        style={isPreviousDisabled ? disabledButtonStyles : buttonStyles}
        data-testid="pagination-previous-btn"
      >
        Anterior
      </button>
      <span style={textStyles} data-testid="pagination-text">
        Página {page} de {totalPages}
      </span>
      <button
        onClick={handleNext}
        disabled={isNextDisabled}
        style={isNextDisabled ? disabledButtonStyles : buttonStyles}
        data-testid="pagination-next-btn"
      >
        Siguiente
      </button>
    </div>
  );
};
