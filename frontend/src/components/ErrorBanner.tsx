import React from 'react';

export interface ErrorBannerProps {
  message: string;
}

/**
 * Franja de error: bloque de peligro macizo a la izquierda con el rótulo en
 * versalita, y el mensaje en texto plano al lado. Sin ícono de alerta ni
 * fondo lavado — el error se anuncia como un sello, no como un susurro.
 */
export const ErrorBanner: React.FC<ErrorBannerProps> = ({ message }) => {
  return (
    <div
      className="mb-4 flex items-stretch border border-danger/40 bg-danger/10"
      data-testid="error-banner"
      role="alert"
    >
      <span className="u-meta flex items-center bg-danger px-2 py-3 text-white" aria-hidden="true">
        Error
      </span>
      <p className="px-4 py-3 text-sm leading-normal text-danger">{message}</p>
    </div>
  );
};
