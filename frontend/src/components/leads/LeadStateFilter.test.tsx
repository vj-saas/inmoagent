import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { LeadStateFilter, UI_STATE_GROUPS } from './LeadStateFilter';
import type { ConversationState } from '../../api/endpoints';

afterEach(() => cleanup());

// Los 6 valores reales del enum (prisma/schema.prisma). Si el enum cambia,
// este test debe fallar hasta que UI_STATE_GROUPS se actualice.
const ALL_REAL_STATES: ConversationState[] = [
  'GREETING',
  'QUALIFICATION',
  'SEARCH_MATCH',
  'SCHEDULING',
  'HUMAN_HANDOFF',
  'OPTED_OUT',
];

describe('LeadStateFilter', () => {
  it('UI_STATE_GROUPS cubre exactamente los 6 estados reales sin inventar ninguno', () => {
    const allMapped = Object.values(UI_STATE_GROUPS).flat();
    // Ninguno inventado
    for (const s of allMapped) {
      expect(ALL_REAL_STATES).toContain(s);
    }
    // Ninguno faltante
    for (const s of ALL_REAL_STATES) {
      expect(allMapped).toContain(s);
    }
    // Sin duplicados entre categorías
    expect(new Set(allMapped).size).toBe(allMapped.length);
  });

  it('renderiza el selector con las 6 categorías en español', () => {
    render(<LeadStateFilter onChange={vi.fn()} />);
    const select = screen.getByTestId('lead-state-filter');
    expect(select).toBeInTheDocument();
    const options = screen.getAllByRole('option').map((o) => (o as HTMLOptionElement).value);
    expect(options).toEqual([
      'Todas',
      'Nuevo / calificando',
      'En búsqueda',
      'Agendó visita',
      'Atención humana',
      'Dado de baja',
    ]);
  });

  it('"Nuevo / calificando" emite GREETING y QUALIFICATION', () => {
    const onChange = vi.fn();
    render(<LeadStateFilter onChange={onChange} />);
    fireEvent.change(screen.getByTestId('lead-state-filter'), {
      target: { value: 'Nuevo / calificando' },
    });
    expect(onChange).toHaveBeenCalledWith(['GREETING', 'QUALIFICATION']);
  });

  it('"En búsqueda" emite SEARCH_MATCH', () => {
    const onChange = vi.fn();
    render(<LeadStateFilter onChange={onChange} />);
    fireEvent.change(screen.getByTestId('lead-state-filter'), {
      target: { value: 'En búsqueda' },
    });
    expect(onChange).toHaveBeenCalledWith(['SEARCH_MATCH']);
  });

  it('"Agendó visita" emite SCHEDULING', () => {
    const onChange = vi.fn();
    render(<LeadStateFilter onChange={onChange} />);
    fireEvent.change(screen.getByTestId('lead-state-filter'), {
      target: { value: 'Agendó visita' },
    });
    expect(onChange).toHaveBeenCalledWith(['SCHEDULING']);
  });

  it('"Atención humana" emite HUMAN_HANDOFF', () => {
    const onChange = vi.fn();
    render(<LeadStateFilter onChange={onChange} />);
    fireEvent.change(screen.getByTestId('lead-state-filter'), {
      target: { value: 'Atención humana' },
    });
    expect(onChange).toHaveBeenCalledWith(['HUMAN_HANDOFF']);
  });

  it('"Dado de baja" emite OPTED_OUT', () => {
    const onChange = vi.fn();
    render(<LeadStateFilter onChange={onChange} />);
    fireEvent.change(screen.getByTestId('lead-state-filter'), {
      target: { value: 'Dado de baja' },
    });
    expect(onChange).toHaveBeenCalledWith(['OPTED_OUT']);
  });

  it('"Todas" emite undefined (sin filtro de estado)', () => {
    const onChange = vi.fn();
    render(<LeadStateFilter onChange={onChange} value="Agendó visita" />);
    fireEvent.change(screen.getByTestId('lead-state-filter'), {
      target: { value: 'Todas' },
    });
    expect(onChange).toHaveBeenCalledWith(undefined);
  });
});
