import React from 'react';

export interface SpinnerProps {
  text?: string;
}

/**
 * Indicador de carga: un bloque macizo girando sobre su eje. Cuadrado, no
 * circular — el sistema no tiene curvas, tampoco cuando espera.
 */
export const Spinner: React.FC<SpinnerProps> = ({ text = 'Cargando...' }) => {
  return (
    <div className="flex items-center justify-center gap-3 p-8" data-testid="spinner">
      <div className="h-3 w-3 animate-spin bg-accent-loud" aria-hidden="true" />
      <span className="u-meta text-text-muted">{text}</span>
    </div>
  );
};
