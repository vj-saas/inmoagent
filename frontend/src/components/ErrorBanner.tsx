import React from 'react';

export interface ErrorBannerProps {
  message: string;
}

export const ErrorBanner: React.FC<ErrorBannerProps> = ({ message }) => {
  return (
    <div
      className="mb-4 rounded-sm border-l-4 border-danger bg-danger/10 px-4 py-3 text-sm leading-normal text-danger"
      data-testid="error-banner"
      role="alert"
    >
      {message}
    </div>
  );
};
