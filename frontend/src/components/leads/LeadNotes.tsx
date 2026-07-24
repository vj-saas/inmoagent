import React from 'react';
import type { LeadNote } from '../../api/endpoints';

export interface LeadNotesProps {
  notes: LeadNote[];
}

/**
 * Renderiza la lista de notas internas de un lead.
 *
 * - Se renderizan en el orden recibido (el backend ya ordena por createdAt desc).
 * - Muestra autor (`note.author?.email ?? 'Sistema'`), fecha formateada en
 *   español y el texto de la nota.
 * - Valida AC-5/AC-7 en conjunto con `NoteForm`.
 */
export const LeadNotes: React.FC<LeadNotesProps> = ({ notes }) => {
  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    const formatter = new Intl.DateTimeFormat('es-AR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    return formatter.format(date);
  };

  if (notes.length === 0) {
    return (
      <div data-testid="lead-notes-empty" style={{ padding: '12px', color: '#9ca3af', fontSize: '14px' }}>
        Sin notas aún
      </div>
    );
  }

  return (
    <ul
      data-testid="lead-notes-list"
      style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}
    >
      {notes.map((note) => (
        <li
          key={note.id}
          data-testid={`lead-note-${note.id}`}
          style={{ padding: '8px', border: '1px solid #e5e7eb', borderRadius: '6px' }}
        >
          <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>
            <span data-testid={`lead-note-author-${note.id}`}>
              {note.author?.email ?? 'Sistema'}
            </span>
            {' · '}
            <span data-testid={`lead-note-date-${note.id}`}>{formatDate(note.createdAt)}</span>
          </div>
          <div data-testid={`lead-note-body-${note.id}`} style={{ fontSize: '14px', whiteSpace: 'pre-wrap' }}>
            {note.body}
          </div>
        </li>
      ))}
    </ul>
  );
};
