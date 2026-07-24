import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { EmptyState } from './EmptyState';

describe('EmptyState', () => {
  beforeEach(() => {
    cleanup();
  });

  it('renders title and message in Spanish with the default testid', () => {
    render(<EmptyState title="Sin leads" message="No se encontraron leads para este filtro." />);
    expect(screen.getByTestId('empty-state')).toBeInTheDocument();
    expect(screen.getByText('Sin leads')).toBeInTheDocument();
    expect(screen.getByText('No se encontraron leads para este filtro.')).toBeInTheDocument();
  });

  it('renders an optional icon (glifo)', () => {
    render(
      <EmptyState icon={<span>🔍</span>} title="Sin resultados" message="Probá con otro filtro." />
    );
    expect(screen.getByText('🔍')).toBeInTheDocument();
  });

  it('allows configuring data-testid to reuse leads-empty / call-queue-empty', () => {
    render(<EmptyState testId="leads-empty" title="Sin leads" message="Mensaje" />);
    expect(screen.getByTestId('leads-empty')).toBeInTheDocument();

    cleanup();
    render(<EmptyState testId="call-queue-empty" title="Sin llamadas" message="Mensaje" />);
    expect(screen.getByTestId('call-queue-empty')).toBeInTheDocument();
  });

  it('merges a custom className', () => {
    render(<EmptyState className="empty-extra" title="Título" message="Mensaje" />);
    expect(screen.getByTestId('empty-state').className).toContain('empty-extra');
  });
});
