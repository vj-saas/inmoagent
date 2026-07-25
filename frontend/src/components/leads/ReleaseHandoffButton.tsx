import React, { useState } from 'react';
import { releaseLead } from '../../api/endpoints';
import type { Lead } from '../../api/endpoints';
import { useApi } from '../../hooks/useApi';
import { Button, Modal } from '../ui';

export interface ReleaseHandoffButtonProps {
  lead: Lead;
  tenantId: string;
  token: string;
  /**
   * Callback invocado sin argumentos tras liberar exitosamente el handoff.
   * El padre es responsable de refetch de `getLead` para reflejar el nuevo estado.
   */
  onReleased: () => void;
}

/**
 * Botón que libera un lead en estado `HUMAN_HANDOFF`.
 *
 * - Solo se renderiza si `lead.state === 'HUMAN_HANDOFF'` (AC-15).
 * - El click en el botón principal solo abre un `Modal` de confirmación;
 *   `releaseLead` se invoca únicamente desde el botón Confirmar del modal.
 *   Cancelar cierra el modal sin invocar `releaseLead`.
 * - Al resolver, dispara el callback `onReleased()` para que el padre refetch
 *   el lead.
 * - Valida AC-15.
 */
export const ReleaseHandoffButton: React.FC<ReleaseHandoffButtonProps> = ({
  lead,
  tenantId,
  token,
  onReleased,
}) => {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const { loading, error, run } = useApi(
    releaseLead as unknown as (...args: unknown[]) => Promise<{ released: true }>,
  );

  if (lead.state !== 'HUMAN_HANDOFF') {
    return null;
  }

  const handleOpenModal = (): void => {
    setConfirmOpen(true);
  };

  const handleCancel = (): void => {
    setConfirmOpen(false);
  };

  const handleConfirm = async (): Promise<void> => {
    try {
      await run(tenantId, lead.id, token);
      setConfirmOpen(false);
      onReleased();
    } catch {
      // El error queda expuesto vía `error` del useApi; el modal sigue abierto.
    }
  };

  return (
    <div data-testid="release-handoff-button-container">
      <Button
        data-testid="release-handoff-button"
        onClick={handleOpenModal}
        disabled={loading}
        size="sm"
      >
        {loading ? 'Liberando...' : 'Devolver al agente IA'}
      </Button>

      <Modal
        open={confirmOpen}
        onClose={handleCancel}
        data-testid="release-handoff-modal"
        title="Devolver al agente IA"
      >
        <p className="text-sm text-text">
          Esta acción devuelve la conversación al agente IA y el bot vuelve a responderle a este
          lead.
        </p>
        <p className="mt-2 text-sm text-text">¿Confirmás que querés devolver el handoff?</p>
        {error && (
          <div data-testid="release-handoff-error" className="mt-2 text-sm text-danger">
            No se pudo liberar el handoff. Intentá nuevamente.
          </div>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <Button
            type="button"
            data-testid="release-handoff-cancel"
            disabled={loading}
            onClick={handleCancel}
            variant="secondary"
            size="sm"
          >
            Cancelar
          </Button>
          <Button
            type="button"
            data-testid="release-handoff-confirm"
            disabled={loading}
            onClick={() => void handleConfirm()}
            size="sm"
          >
            {loading ? 'Liberando...' : 'Confirmar'}
          </Button>
        </div>
      </Modal>
    </div>
  );
};
