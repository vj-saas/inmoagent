import React from 'react';

export interface SpinnerProps {
  text?: string;
}

export const Spinner: React.FC<SpinnerProps> = ({ text = 'Cargando...' }) => {
  return (
    <div
      className="flex items-center justify-center gap-3 p-4"
      data-testid="spinner"
    >
      <div
        className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-text"
        aria-hidden="true"
      />
      <span>{text}</span>
    </div>
  );
};
