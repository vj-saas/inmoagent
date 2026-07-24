import { beforeEach, describe, it, expect, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import type { LeadNote } from '../../api/endpoints';
import { createNote } from '../../api/endpoints';
import { NoteForm } from './NoteForm';

vi.mock('../../api/endpoints', () => ({
  createNote: vi.fn(),
}));

describe('NoteForm Component', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  const mockCreateNote = createNote as unknown as ReturnType<typeof vi.fn>;

  it('deshabilita el submit cuando el texto está vacío', () => {
    render(
      <NoteForm tenantId="tenant-1" leadId="lead-1" token="tok" onCreated={vi.fn()} />,
    );

    expect(screen.getByTestId('note-form-submit')).toBeDisabled();
  });

  it('no invoca createNote si el texto es solo espacios', () => {
    render(
      <NoteForm tenantId="tenant-1" leadId="lead-1" token="tok" onCreated={vi.fn()} />,
    );

    fireEvent.change(screen.getByTestId('note-form-textarea'), { target: { value: '   ' } });
    expect(screen.getByTestId('note-form-submit')).toBeDisabled();
    fireEvent.submit(screen.getByTestId('note-form'));

    expect(mockCreateNote).not.toHaveBeenCalled();
    expect(screen.getByTestId('note-form-validation-error')).toHaveTextContent(
      'La nota no puede estar vacía.',
    );
  });

  it('invoca createNote y onCreated con la nota devuelta al enviar con éxito', async () => {
    const createdNote: LeadNote = {
      id: 'note-1',
      tenantId: 'tenant-1',
      leadId: 'lead-1',
      authorPersonId: 'person-1',
      author: { id: 'person-1', email: 'agente@inmo.test' },
      body: 'Cliente confirmó visita',
      createdAt: new Date().toISOString(),
    };
    mockCreateNote.mockResolvedValue(createdNote);

    const onCreated = vi.fn();
    render(
      <NoteForm tenantId="tenant-1" leadId="lead-1" token="tok" onCreated={onCreated} />,
    );

    fireEvent.change(screen.getByTestId('note-form-textarea'), {
      target: { value: 'Cliente confirmó visita' },
    });
    fireEvent.submit(screen.getByTestId('note-form'));

    await waitFor(() => {
      expect(onCreated).toHaveBeenCalledWith(createdNote);
    });

    expect(mockCreateNote).toHaveBeenCalledWith(
      'tenant-1',
      'lead-1',
      'Cliente confirmó visita',
      'tok',
    );
  });

  it('muestra error de API si createNote falla, sin llamar a onCreated', async () => {
    mockCreateNote.mockRejectedValue(new Error('falló'));

    const onCreated = vi.fn();
    render(
      <NoteForm tenantId="tenant-1" leadId="lead-1" token="tok" onCreated={onCreated} />,
    );

    fireEvent.change(screen.getByTestId('note-form-textarea'), {
      target: { value: 'Texto válido' },
    });
    fireEvent.submit(screen.getByTestId('note-form'));

    await waitFor(() => {
      expect(screen.getByTestId('note-form-api-error')).toBeInTheDocument();
    });
    expect(onCreated).not.toHaveBeenCalled();
  });
});
