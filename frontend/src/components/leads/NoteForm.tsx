import React, { useState } from 'react';
import { createNote } from '../../api/endpoints';
import type { LeadNote } from '../../api/endpoints';
import { useApi } from '../../hooks/useApi';
import { Button } from '../ui';

export interface NoteFormProps {
  tenantId: string;
  leadId: string;
  token: string;
  /**
   * Callback invocado con la nota recién creada por el backend. Quien
   * consume este componente es responsable de insertarla al tope de la
   * lista en memoria (sin refetch).
   */
  onCreated: (note: LeadNote) => void;
}

/**
 * Formulario para agregar una nota interna a un lead.
 *
 * - Valida que el texto no esté vacío (ni solo espacios) antes de invocar
 *   `createNote`; si está vacío, deshabilita el submit y muestra un error en
 *   español, sin llamar a la API (AC-6).
 * - Al recibir la nota creada exitosamente, invoca `onCreated` para que el
 *   padre la inserte en memoria (AC-5, AC-7).
 */
export const NoteForm: React.FC<NoteFormProps> = ({ tenantId, leadId, token, onCreated }) => {
  const [body, setBody] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const { loading, error, run } = useApi(
    createNote as unknown as (...args: unknown[]) => Promise<LeadNote>,
  );

  const isEmpty = body.trim().length === 0;

  const handleSubmit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();

    if (isEmpty) {
      setValidationError('La nota no puede estar vacía.');
      return;
    }

    setValidationError(null);

    try {
      const note = await run(tenantId, leadId, body.trim(), token);
      setBody('');
      onCreated(note);
    } catch {
      // El error ya queda expuesto vía `error` del useApi.
    }
  };

  return (
    <form data-testid="note-form" onSubmit={(e) => void handleSubmit(e)} className="mt-3">
      <textarea
        data-testid="note-form-textarea"
        value={body}
        onChange={(e) => {
          setBody(e.target.value);
          if (validationError) setValidationError(null);
        }}
        placeholder="Escribí una nota interna..."
        rows={3}
        className="w-full resize-y rounded border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      />
      {validationError && (
        <div data-testid="note-form-validation-error" className="mt-1 text-sm text-danger">
          {validationError}
        </div>
      )}
      {error && (
        <div data-testid="note-form-api-error" className="mt-1 text-sm text-danger">
          No se pudo guardar la nota. Intentá nuevamente.
        </div>
      )}
      <Button
        type="submit"
        data-testid="note-form-submit"
        disabled={isEmpty || loading}
        className="mt-2"
        size="sm"
      >
        {loading ? 'Guardando...' : 'Agregar nota'}
      </Button>
    </form>
  );
};
