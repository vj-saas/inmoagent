import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { Badge } from './Badge';

describe('Badge', () => {
  beforeEach(() => {
    cleanup();
  });

  it('defaults to tone neutral', () => {
    render(<Badge data-testid="badge">Nuevo</Badge>);
    expect(screen.getByTestId('badge').className).toContain('bg-bg');
  });

  it('applies the info/success/warning/danger tone classes', () => {
    const { rerender } = render(
      <Badge tone="info" data-testid="badge">
        Info
      </Badge>
    );
    expect(screen.getByTestId('badge').className).toContain('text-info');

    rerender(
      <Badge tone="success" data-testid="badge">
        Ok
      </Badge>
    );
    expect(screen.getByTestId('badge').className).toContain('text-success');

    rerender(
      <Badge tone="warning" data-testid="badge">
        Atención
      </Badge>
    );
    expect(screen.getByTestId('badge').className).toContain('text-warning');

    rerender(
      <Badge tone="danger" data-testid="badge">
        Error
      </Badge>
    );
    expect(screen.getByTestId('badge').className).toContain('text-danger');
  });

  it('merges a custom className', () => {
    render(
      <Badge className="badge-extra" data-testid="badge">
        Texto
      </Badge>
    );
    expect(screen.getByTestId('badge').className).toContain('badge-extra');
  });
});
