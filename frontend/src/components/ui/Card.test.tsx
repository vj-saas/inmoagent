import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { Card, CardHeader, CardBody } from './Card';

describe('Card / CardHeader / CardBody', () => {
  beforeEach(() => {
    cleanup();
  });

  it('renders header and body content inside the card', () => {
    render(
      <Card data-testid="card">
        <CardHeader data-testid="card-header">Título</CardHeader>
        <CardBody data-testid="card-body">Contenido</CardBody>
      </Card>
    );
    expect(screen.getByTestId('card')).toBeInTheDocument();
    expect(screen.getByTestId('card-header')).toHaveTextContent('Título');
    expect(screen.getByTestId('card-body')).toHaveTextContent('Contenido');
  });

  it('applies default surface classes to Card', () => {
    render(<Card data-testid="card">contenido</Card>);
    expect(screen.getByTestId('card').className).toContain('bg-surface');
  });

  it('merges custom classNames on all three components', () => {
    render(
      <Card className="card-extra" data-testid="card">
        <CardHeader className="header-extra" data-testid="card-header">
          h
        </CardHeader>
        <CardBody className="body-extra" data-testid="card-body">
          b
        </CardBody>
      </Card>
    );
    expect(screen.getByTestId('card').className).toContain('card-extra');
    expect(screen.getByTestId('card-header').className).toContain('header-extra');
    expect(screen.getByTestId('card-body').className).toContain('body-extra');
  });
});
