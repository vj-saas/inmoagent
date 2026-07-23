import React from 'react';

export interface ErrorBannerProps {
  message: string;
}

export const ErrorBanner: React.FC<ErrorBannerProps> = ({ message }) => {
  const bannerStyles: React.CSSProperties = {
    backgroundColor: '#fee',
    borderLeft: '4px solid #c33',
    color: '#900',
    padding: '12px 16px',
    marginBottom: '16px',
    borderRadius: '4px',
    fontSize: '14px',
    lineHeight: '1.5',
  };

  return (
    <div style={bannerStyles} data-testid="error-banner" role="alert">
      {message}
    </div>
  );
};
