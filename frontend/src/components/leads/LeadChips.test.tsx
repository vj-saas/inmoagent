import { beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { LeadChips } from './LeadChips';

describe('LeadChips Component', () => {
  beforeEach(() => {
    cleanup();
  });

  it('no renderiza ningún chip cuando todos los campos están ausentes', () => {
    const { container } = render(
      <LeadChips
        fOperation={null}
        fNeighborhoods={[]}
        fMaxPrice={null}
        fCurrency={null}
        fMinRooms={null}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renderiza chip "Venta" cuando fOperation es SALE', () => {
    render(<LeadChips fOperation="SALE" />);
    expect(screen.getByText('Venta')).toBeInTheDocument();
  });

  it('renderiza chip "Alquiler" cuando fOperation es RENT', () => {
    render(<LeadChips fOperation="RENT" />);
    expect(screen.getByText('Alquiler')).toBeInTheDocument();
  });

  it('no renderiza chip de operación cuando fOperation es null', () => {
    render(<LeadChips fOperation={null} fMinRooms={2} />);
    expect(screen.queryByText('Venta')).not.toBeInTheDocument();
    expect(screen.queryByText('Alquiler')).not.toBeInTheDocument();
  });

  it('renderiza chip de barrios cuando fNeighborhoods tiene elementos', () => {
    render(<LeadChips fNeighborhoods={['Palermo', 'Belgrano']} />);
    expect(screen.getByText('Barrios: Palermo, Belgrano')).toBeInTheDocument();
  });

  it('no renderiza chip de barrios cuando el array está vacío', () => {
    const { container } = render(<LeadChips fNeighborhoods={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renderiza chip de presupuesto parseando fMaxPrice como string (Decimal serializado)', () => {
    render(<LeadChips fMaxPrice="150000" fCurrency="USD" />);
    expect(screen.getByText('Hasta USD 150.000')).toBeInTheDocument();
  });

  it('no renderiza chip de presupuesto si falta fMaxPrice aunque haya fCurrency', () => {
    const { container } = render(<LeadChips fMaxPrice={null} fCurrency="USD" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('no renderiza chip de presupuesto si falta fCurrency aunque haya fMaxPrice', () => {
    const { container } = render(<LeadChips fMaxPrice="100000" fCurrency={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renderiza chip de ambientes cuando fMinRooms está presente', () => {
    render(<LeadChips fMinRooms={3} />);
    expect(screen.getByText('3+ ambientes')).toBeInTheDocument();
  });

  it('no renderiza chip de ambientes cuando fMinRooms es null', () => {
    const { container } = render(<LeadChips fMinRooms={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renderiza todos los chips combinados cuando todos los campos están presentes', () => {
    render(
      <LeadChips
        fOperation="RENT"
        fNeighborhoods={['Caballito']}
        fMaxPrice="200000"
        fCurrency="ARS"
        fMinRooms={2}
      />,
    );
    expect(screen.getByText('Alquiler')).toBeInTheDocument();
    expect(screen.getByText('Barrios: Caballito')).toBeInTheDocument();
    expect(screen.getByText('Hasta ARS 200.000')).toBeInTheDocument();
    expect(screen.getByText('2+ ambientes')).toBeInTheDocument();
  });
});
