import React from 'react';

export interface SpinnerProps {
  text?: string;
}

export const Spinner: React.FC<SpinnerProps> = ({ text = 'Cargando...' }) => {
  const spinnerStyles: React.CSSProperties = {
    display: 'inline-block',
    width: '24px',
    height: '24px',
    border: '3px solid rgba(0, 0, 0, 0.1)',
    borderRadius: '50%',
    borderTopColor: '#333',
    animation: 'spin 1s linear infinite',
  };

  const containerStyles: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '12px',
    padding: '16px',
  };

  return (
    <div style={containerStyles} data-testid="spinner">
      <style>{`
        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
      <div style={spinnerStyles} />
      <span>{text}</span>
    </div>
  );
};
