import { beforeEach, describe, it, expect } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import type { LeadNote } from '../../api/endpoints';
import { LeadNotes } from './LeadNotes';

describe('LeadNotes Component', () => {
  beforeEach(() => {
    cleanup();
  });

  const createMockNote = (overrides: Partial<LeadNote> = {}): LeadNote => ({
    id: 'note-' + Math.random().toString(36).substr(2, 9),
    tenantId: 'tenant-1',
    leadId: 'lead-1',
    authorPersonId: 'person-1',
    author: { id: 'person-1', email: 'agente@inmo.test' },
    body: 'Llamar mañana',
    createdAt: new Date('2026-07-24T09:00:00Z').toISOString(),
    ...overrides,
  });

  it('muestra un mensaje cuando no hay notas', () => {
    render(<LeadNotes notes={[]} />);
    expect(screen.getByTestId('lead-notes-empty')).toBeInTheDocument();
  });

  it('renderiza autor, fecha y texto de cada nota', () => {
    const note = createMockNote({ body: 'Cliente pidió reagendar visita' });
    render(<LeadNotes notes={[note]} />);

    expect(screen.getByTestId(`lead-note-author-${note.id}`)).toHaveTextContent('agente@inmo.test');
    expect(screen.getByTestId(`lead-note-body-${note.id}`)).toHaveTextContent(
      'Cliente pidió reagendar visita',
    );
    expect(screen.getByTestId(`lead-note-date-${note.id}`).textContent).toMatch(/\d{2}\/\d{2}\/\d{4}/);
  });

  it('muestra "Sistema" cuando la nota no tiene autor', () => {
    const note = createMockNote({ author: null, authorPersonId: null });
    render(<LeadNotes notes={[note]} />);

    expect(screen.getByTestId(`lead-note-author-${note.id}`)).toHaveTextContent('Sistema');
  });

  it('renderiza múltiples notas en el orden recibido, sin reordenar', () => {
    const note1 = createMockNote({ id: 'note-1', body: 'Primera nota (más reciente)' });
    const note2 = createMockNote({ id: 'note-2', body: 'Segunda nota' });
    const note3 = createMockNote({ id: 'note-3', body: 'Tercera nota (más vieja)' });

    render(<LeadNotes notes={[note1, note2, note3]} />);

    const items = screen.getAllByTestId(/^lead-note-note-\d$/);
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent('Primera nota (más reciente)');
    expect(items[1]).toHaveTextContent('Segunda nota');
    expect(items[2]).toHaveTextContent('Tercera nota (más vieja)');
  });
});
