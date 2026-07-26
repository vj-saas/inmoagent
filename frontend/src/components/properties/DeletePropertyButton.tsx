import React, { useState } from 'react';
import { removeProperty } from '../../api/endpoints';
import type { Property } from '../../api/endpoints';
import { useApi } from '../../hooks/useApi';
import { Button, Modal } from '../ui';
import { ErrorBanner } from '../ErrorBanner';

export interface DeletePropertyButtonProps {
  property: Property;
  tenantId: string;
  token: string;
  /**
   * Callback invocado sin argumentos tras borrar exitosamente la propiedad.
   * El padre es responsable de refetch del listado (sin optimistic update:
   * si el backend devuelve 409 la fila debe seguir visible, ver AC-10).
   */
  onDeleted: () => void;
}

/**
 * Botón secundario que borra una propiedad tras confirmación en un `Modal`.
 *
 * - El click en el botón principal solo abre el `Modal` de confirmación;
 *   `removeProperty` se invoca únicamente desde el botón Confirmar del modal.
 *   Cancelar cierra el modal sin invocar `removeProperty`.
 * - Ante 409 (propiedad con `Appointment` asociado), muestra el mensaje del
 *   backend en un `ErrorBanner` y NO dispara `onDeleted` (la fila permanece
 *   en la lista, el padre no hace optimistic update).
 * - Valida AC-9, AC-10.
 */
export const DeletePropertyButton: React.FC<DeletePropertyButtonProps> = ({
  property,
  tenantId,
  token,
  onDeleted,
}) => {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const { loading, error, run } = useApi(
    removeProperty as unknown as (...args: unknown[]) => Promise<{ deleted: true }>,
  );

  const handleOpenModal = (): void => {
    setConfirmOpen(true);
  };

  const handleCancel = (): void => {
    setConfirmOpen(false);
  };

  const handleConfirm = async (): Promise<void> => {
    try {
      await run(tenantId, property.id, token);
      setConfirmOpen(false);
      onDeleted();
    } catch {
      // El error queda expuesto vía `error` del useApi; el modal sigue abierto.
    }
  };

  return (
    <div data-testid="delete-property-button-container">
      <Button
        data-testid="delete-property-button"
        onClick={handleOpenModal}
        disabled={loading}
        variant="secondary"
        size="sm"
      >
        {loading ? 'Eliminando...' : 'Eliminar'}
      </Button>

      <Modal
        open={confirmOpen}
        onClose={handleCancel}
        data-testid="delete-property-modal"
        title="Eliminar propiedad"
      >
        <p className="text-sm text-text">
          Esta acción elimina la propiedad &ldquo;{property.title}&rdquo; de forma permanente.
        </p>
        <p className="mt-2 text-sm text-text">¿Confirmás que querés eliminarla?</p>
        {error && <ErrorBanner message={error.message} />}
        <div className="mt-4 flex justify-end gap-2">
          <Button
            type="button"
            data-testid="delete-property-cancel"
            disabled={loading}
            onClick={handleCancel}
            variant="secondary"
            size="sm"
          >
            Cancelar
          </Button>
          <Button
            type="button"
            data-testid="delete-property-confirm"
            disabled={loading}
            onClick={() => void handleConfirm()}
            size="sm"
          >
            {loading ? 'Eliminando...' : 'Confirmar'}
          </Button>
        </div>
      </Modal>
    </div>
  );
};
