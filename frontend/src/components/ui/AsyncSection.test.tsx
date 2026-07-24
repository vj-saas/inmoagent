import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { AsyncSection } from './AsyncSection';

describe('AsyncSection', () => {
  beforeEach(() => {
    cleanup();
  });

  it('shows the Spinner when loading and no custom skeleton is given', () => {
    render(
      <AsyncSection loading error={null} isEmpty={false}>
        <div>Contenido</div>
      </AsyncSection>
    );
    expect(screen.getByTestId('spinner')).toBeInTheDocument();
  });

  it('shows the given skeleton instead of the Spinner when loading', () => {
    render(
      <AsyncSection loading error={null} isEmpty={false} skeleton={<div data-testid="mi-skeleton" />}>
        <div>Contenido</div>
      </AsyncSection>
    );
    expect(screen.getByTestId('mi-skeleton')).toBeInTheDocument();
    expect(screen.queryByTestId('spinner')).not.toBeInTheDocument();
  });

  it('shows the ErrorBanner with the given message when there is an error, even if not loading', () => {
    render(
      <AsyncSection loading={false} error="No se pudo cargar la información." isEmpty={false}>
        <div>Contenido</div>
      </AsyncSection>
    );
    expect(screen.getByTestId('error-banner')).toHaveTextContent(
      'No se pudo cargar la información.'
    );
  });

  it('shows the EmptyState when isEmpty is true and there is no loading/error', () => {
    render(
      <AsyncSection
        loading={false}
        error={null}
        isEmpty
        emptyTitle="Sin datos"
        emptyMessage="No hay elementos."
        emptyTestId="my-empty"
      >
        <div>Contenido</div>
      </AsyncSection>
    );
    expect(screen.getByTestId('my-empty')).toBeInTheDocument();
    expect(screen.getByText('Sin datos')).toBeInTheDocument();
  });

  it('renders children when there is no loading, error or empty state', () => {
    render(
      <AsyncSection loading={false} error={null} isEmpty={false}>
        <div>Contenido real</div>
      </AsyncSection>
    );
    expect(screen.getByText('Contenido real')).toBeInTheDocument();
  });

  it('respects render precedence: loading beats error and empty', () => {
    render(
      <AsyncSection loading error="algún error" isEmpty>
        <div>Contenido</div>
      </AsyncSection>
    );
    expect(screen.getByTestId('spinner')).toBeInTheDocument();
    expect(screen.queryByTestId('error-banner')).not.toBeInTheDocument();
  });
});
