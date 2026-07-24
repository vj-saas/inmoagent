import { beforeEach, describe, it, expect } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import type { Lead } from '../../api/endpoints';
import { LeadsList } from './LeadsList';

describe('LeadsList Component', () => {
  beforeEach(() => {
    cleanup();
  });

  const mockLeads: Lead[] = [
    {
      id: 'lead-1',
      tenantId: 'tenant-1',
      phone: '+541234567890',
      name: 'Juan Pérez',
      state: 'GREETING',
      fOperation: 'SALE',
      fNeighborhoods: ['Palermo'],
      fMaxPrice: '500000',
      fCurrency: 'USD',
      fMinRooms: 2,
      fGarage: false,
      fPetsAllowed: true,
      fNotes: null,
      fPreferredDay: null,
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
    },
    {
      id: 'lead-2',
      tenantId: 'tenant-1',
      phone: '+549876543210',
      name: 'María García',
      state: 'QUALIFICATION',
      fOperation: 'RENT',
      fNeighborhoods: ['Belgrano'],
      fMaxPrice: '2000',
      fCurrency: 'ARS',
      fMinRooms: 1,
      fGarage: null,
      fPetsAllowed: null,
      fNotes: null,
      fPreferredDay: null,
      fOfferedNeighborhoods: [],
      fPriceMentionedAtTurn: null,
      handoffAt: null,
      optedOutAt: null,
      lastMessageAt: '2026-07-24T09:30:00Z',
      greetedAt: '2026-07-24T08:00:00Z',
      lastSearchIds: [],
      turnCount: 1,
      createdAt: '2026-07-24T08:00:00Z',
      updatedAt: '2026-07-24T09:30:00Z',
    },
    {
      id: 'lead-3',
      tenantId: 'tenant-1',
      phone: '+541111111111',
      name: 'Carlos López',
      state: 'SEARCH_MATCH',
      fOperation: null,
      fNeighborhoods: [],
      fMaxPrice: null,
      fCurrency: null,
      fMinRooms: null,
      fGarage: null,
      fPetsAllowed: null,
      fNotes: null,
      fPreferredDay: null,
      fOfferedNeighborhoods: [],
      fPriceMentionedAtTurn: null,
      handoffAt: null,
      optedOutAt: null,
      lastMessageAt: '2026-07-24T08:00:00Z',
      greetedAt: '2026-07-24T07:00:00Z',
      lastSearchIds: [],
      turnCount: 0,
      createdAt: '2026-07-24T07:00:00Z',
      updatedAt: '2026-07-24T08:00:00Z',
    },
  ];

  function renderLeadsList(leads: Lead[] = mockLeads) {
    render(
      <MemoryRouter initialEntries={['/leads']}>
        <Routes>
          <Route path="/leads" element={<LeadsList leads={leads} />} />
          <Route path="/leads/:leadId" element={<div>Lead detail page</div>} />
        </Routes>
      </MemoryRouter>,
    );
  }

  it('renderiza una fila por cada lead en el array (AC-1)', () => {
    renderLeadsList();
    const rows = screen.getAllByTestId('lead-row');
    expect(rows).toHaveLength(3);
  });

  it('mantiene el orden de los leads recibido sin reordenar (AC-1)', () => {
    renderLeadsList();
    const names = screen.getAllByTestId('lead-name');
    expect(names[0]).toHaveTextContent('Juan Pérez');
    expect(names[1]).toHaveTextContent('María García');
    expect(names[2]).toHaveTextContent('Carlos López');
  });

  it('renderiza una lista vacía cuando no hay leads', () => {
    renderLeadsList([]);
    const list = screen.getByTestId('leads-list');
    expect(list).toBeInTheDocument();
    expect(list.children).toHaveLength(0);
  });

  it('cada fila es un link navegable hacia /leads/:leadId (AC-13)', async () => {
    renderLeadsList();
    const user = userEvent.setup();

    // Verificar que los links tienen los href correctos
    const link1 = screen.getByTestId('lead-row-lead-1');
    const link2 = screen.getByTestId('lead-row-lead-2');
    const link3 = screen.getByTestId('lead-row-lead-3');

    expect(link1.getAttribute('href')).toBe('/leads/lead-1');
    expect(link2.getAttribute('href')).toBe('/leads/lead-2');
    expect(link3.getAttribute('href')).toBe('/leads/lead-3');
  });

  it('hace click en una fila navega a /leads/:leadId (AC-13)', async () => {
    renderLeadsList();
    const user = userEvent.setup();

    const link1 = screen.getByTestId('lead-row-lead-1');
    await user.click(link1);

    // Verificar que se navegó a la página de detalle
    expect(screen.getByText('Lead detail page')).toBeInTheDocument();
  });

  it('hace click en la tercera fila navega a /leads/lead-3', async () => {
    renderLeadsList();
    const user = userEvent.setup();

    const link3 = screen.getByTestId('lead-row-lead-3');
    expect(link3.getAttribute('href')).toBe('/leads/lead-3');
    await user.click(link3);
    expect(screen.getByText('Lead detail page')).toBeInTheDocument();
  });

  it('renderiza los datos básicos de cada lead (nombre/teléfono y estado)', () => {
    renderLeadsList();
    expect(screen.getByText('Juan Pérez')).toBeInTheDocument();
    expect(screen.getByText('GREETING')).toBeInTheDocument();

    expect(screen.getByText('María García')).toBeInTheDocument();
    expect(screen.getByText('QUALIFICATION')).toBeInTheDocument();

    expect(screen.getByText('Carlos López')).toBeInTheDocument();
    expect(screen.getByText('SEARCH_MATCH')).toBeInTheDocument();
  });

  it('renderiza LeadChips integrado en cada fila (AC-8/AC-9)', () => {
    renderLeadsList();
    // Verificar que se renderizaron algunos chips
    expect(screen.getByText('Venta')).toBeInTheDocument(); // De lead-1
    expect(screen.getByText('Alquiler')).toBeInTheDocument(); // De lead-2
    // lead-3 no tiene filtros, no debería tener chips
  });
});
