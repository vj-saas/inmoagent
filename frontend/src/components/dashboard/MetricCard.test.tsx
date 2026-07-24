import { beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MetricCard } from './MetricCard';

describe('MetricCard Component', () => {
  beforeEach(() => {
    cleanup();
  });

  it('renders the metric card', () => {
    render(<MetricCard label="Test Label" value={42} />);
    const card = screen.getByTestId('metric-card');
    expect(card).toBeInTheDocument();
  });

  it('displays the label received via props', () => {
    render(<MetricCard label="Leads nuevos" value={42} />);
    expect(screen.getByText('Leads nuevos')).toBeInTheDocument();
  });

  it('displays the value received via props', () => {
    render(<MetricCard label="Leads nuevos" value={42} />);
    expect(screen.getByText('42')).toBeInTheDocument();
  });

  it('displays zero value correctly', () => {
    render(<MetricCard label="Conversaciones activas" value={0} />);
    expect(screen.getByText('0')).toBeInTheDocument();
  });

  it('displays large values correctly', () => {
    render(<MetricCard label="Citas confirmadas" value={999} />);
    expect(screen.getByText('999')).toBeInTheDocument();
  });

  it('renders the card as visible', () => {
    render(<MetricCard label="Test" value={100} />);
    const card = screen.getByTestId('metric-card');
    expect(card).toBeVisible();
  });

  it('renders different Spanish labels correctly', () => {
    const { rerender } = render(
      <MetricCard label="Conversaciones activas" value={15} />
    );
    expect(screen.getByText('Conversaciones activas')).toBeInTheDocument();

    rerender(<MetricCard label="Citas propuestas" value={8} />);
    expect(screen.getByText('Citas propuestas')).toBeInTheDocument();
  });
});
