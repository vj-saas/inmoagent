import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { Skeleton } from './Skeleton';

describe('Skeleton', () => {
  beforeEach(() => {
    cleanup();
  });

  it('defaults to the "text" variant with a default testid and animate-pulse', () => {
    render(<Skeleton />);
    const skeleton = screen.getByTestId('skeleton');
    expect(skeleton.className).toContain('animate-pulse');
    expect(skeleton.className).toContain('h-4');
  });

  it('applies the row and card variant classes', () => {
    const { rerender } = render(<Skeleton variant="row" />);
    expect(screen.getByTestId('skeleton').className).toContain('h-10');

    rerender(<Skeleton variant="card" />);
    expect(screen.getByTestId('skeleton').className).toContain('h-32');
  });

  it('allows overriding the data-testid', () => {
    render(<Skeleton data-testid="custom-skeleton" />);
    expect(screen.getByTestId('custom-skeleton')).toBeInTheDocument();
  });

  it('merges a custom className', () => {
    render(<Skeleton className="skeleton-extra" />);
    expect(screen.getByTestId('skeleton').className).toContain('skeleton-extra');
  });
});
