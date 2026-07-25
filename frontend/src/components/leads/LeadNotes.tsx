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
      <div data-testid="lead-notes-empty" className="p-3 text-sm text-text-muted">
        Sin notas aún
      </div>
    );
  }

  return (
    <ul data-testid="lead-notes-list" className="m-0 flex list-none flex-col gap-2 p-0">
      {notes.map((note) => (
        <li
          key={note.id}
          data-testid={`lead-note-${note.id}`}
          className="rounded-sm border border-border p-2"
        >
          <div className="mb-1 text-xs text-text-muted">
            <span data-testid={`lead-note-author-${note.id}`}>
              {note.author?.email ?? 'Sistema'}
            </span>
            {' · '}
            <span data-testid={`lead-note-date-${note.id}`}>{formatDate(note.createdAt)}</span>
          </div>
          <div data-testid={`lead-note-body-${note.id}`} className="whitespace-pre-wrap text-sm">
            {note.body}
          </div>
        </li>
      ))}
    </ul>
  );
};
