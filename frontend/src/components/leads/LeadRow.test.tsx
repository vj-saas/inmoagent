import { beforeEach, describe, it, expect } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { Lead } from '../../api/endpoints';
import { LeadRow } from './LeadRow';

describe('LeadRow Component', () => {
  beforeEach(() => {
    cleanup();
  });

  const mockLead: Lead = {
    id: 'lead-1',
    tenantId: 'tenant-1',
    phone: '+541234567890',
    name: 'Juan Pérez',
    state: 'GREETING',
    fOperation: 'SALE',
    fNeighborhoods: ['Palermo', 'Belgrano'],
    fMaxPrice: '500000',
    fCurrency: 'USD',
    fMinRooms: 2,
    fGarage: false,
    fPetsAllowed: true,
    fNotes: 'Interesado en zona norte',
    fPreferredDay: 'Sábado',
    fOfferedNeighborhoods: [],
    fPriceMentionedAtTurn: null,
    handoffAt: null,
    optedOutAt: null,
    lastMessageAt: '2026-07-24T10:00:00Z',
    greetedAt: '2026-07-24T09:00:00Z',
    lastSearchIds: [],
    turnCount: 2,
    createdAt: '2026-07-24T09:00:00Z',
    updatedAt: '2026-07-24T10:00:00Z',
  };

  function renderLeadRow(lead: Lead) {
    render(
      <MemoryRouter>
        <LeadRow lead={lead} />
      </MemoryRouter>,
    );
  }

  it('renderiza el nombre del lead cuando está disponible', () => {
    renderLeadRow(mockLead);
    expect(screen.getByTestId('lead-name')).toHaveTextContent('Juan Pérez');
  });

  it('renderiza el teléfono cuando el nombre no está disponible', () => {
    const leadWithoutName: Lead = { ...mockLead, name: null };
    renderLeadRow(leadWithoutName);
    expect(screen.getByTestId('lead-name')).toHaveTextContent('+541234567890');
  });

  it('renderiza el estado del lead', () => {
    renderLeadRow(mockLead);
    expect(screen.getByTestId('lead-state')).toHaveTextContent('GREETING');
  });

  it('renderiza LeadChips con los campos del lead', () => {
    renderLeadRow(mockLead);
    // Verificar que se renderizó algo de LeadChips
    expect(screen.getByTestId('lead-chips')).toBeInTheDocument();
    // Verificar que los chips mostrados contienen los datos esperados
    expect(screen.getByText('Venta')).toBeInTheDocument();
    expect(screen.getByText('Barrios: Palermo, Belgrano')).toBeInTheDocument();
    expect(screen.getByText('Hasta USD 500.000')).toBeInTheDocument();
    expect(screen.getByText('2+ ambientes')).toBeInTheDocument();
  });

  it('renderiza una fila sin chips cuando no hay datos de filtros', () => {
    const leadWithoutFilters: Lead = {
      ...mockLead,
      fOperation: null,
      fNeighborhoods: [],
      fMaxPrice: null,
      fCurrency: null,
      fMinRooms: null,
    };
    renderLeadRow(leadWithoutFilters);
    expect(screen.getByTestId('lead-name')).toBeInTheDocument();
    expect(screen.getByTestId('lead-state')).toBeInTheDocument();
    // LeadChips no renderiza nada si todos los campos están vacíos
    expect(screen.queryByTestId('lead-chips')).not.toBeInTheDocument();
  });

  it('la fila es un Link con href correcto hacia /leads/:leadId (AC-13)', () => {
    renderLeadRow(mockLead);
    const link = screen.getByTestId(`lead-row-${mockLead.id}`);
    expect(link).toBeInTheDocument();
    expect(link.tagName).toBe('A');
    expect(link.getAttribute('href')).toBe(`/leads/${mockLead.id}`);
  });

  it('verifica que el atributo href es correcto para diferentes leadIds', () => {
    const lead2: Lead = { ...mockLead, id: 'lead-999' };
    renderLeadRow(lead2);
    const link = screen.getByTestId('lead-row-lead-999');
    expect(link.getAttribute('href')).toBe('/leads/lead-999');
  });

  it('renderiza LeadModeBadge con modo AI cuando el estado no es HUMAN_HANDOFF ni OPTED_OUT (AC-20)', () => {
    renderLeadRow({ ...mockLead, state: 'GREETING' });
    expect(screen.getByTestId('lead-mode-badge')).toHaveTextContent('Agente IA activo');
  });

  it('renderiza LeadModeBadge con modo MANUAL cuando el estado es HUMAN_HANDOFF (AC-20)', () => {
    renderLeadRow({ ...mockLead, state: 'HUMAN_HANDOFF' });
    expect(screen.getByTestId('lead-mode-badge')).toHaveTextContent('Respondiendo vos');
  });

  it('renderiza LeadModeBadge con modo OPTED_OUT cuando el estado es OPTED_OUT (AC-20)', () => {
    renderLeadRow({ ...mockLead, state: 'OPTED_OUT' });
    expect(screen.getByTestId('lead-mode-badge')).toHaveTextContent('Dado de baja');
  });
});
