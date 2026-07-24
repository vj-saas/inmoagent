import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { suppressLead } from '../../api/endpoints';
import { useApi } from '../../hooks/useApi';

export interface SuppressLeadButtonProps {
  tenantId: string;
  leadId: string;
  token: string;
}

/**
 * Botón para suprimir (borrar) un lead de forma definitiva.
 *
 * - Confirmación elegida: modal explícito en español, con un paso
 *   intermedio real (estado local `confirming`), no `window.confirm`. La
 *   spec pide explícitamente un modal de confirmación para esta acción,
 *   a diferencia de `OptOutButton`: acá el borrado es irreversible (cascade
 *   sobre Message/Appointment/LeadNote, ver `docs/02-DATOS.md`), así que
 *   amerita un paso deliberado y visible, no un diálogo nativo del navegador.
 * - `suppressLead` (DELETE) SOLO se invoca desde el handler de confirmación
 *   del modal, nunca desde el click inicial que solo abre el modal.
 * - Tras éxito, navega a `/leads` (la ficha del lead ya no existe).
 */
export const SuppressLeadButton: React.FC<SuppressLeadButtonProps> = ({ tenantId, leadId, token }) => {
  const [confirming, setConfirming] = useState(false);
  const navigate = useNavigate();
  const { loading, error, run } = useApi(
    suppressLead as unknown as (...args: unknown[]) => Promise<{ deleted: true }>,
  );

  const handleOpenModal = (): void => {
    setConfirming(true);
  };

  const handleCancel = (): void => {
    setConfirming(false);
  };

  const handleConfirm = async (): Promise<void> => {
    try {
      await run(tenantId, leadId, token);
      setConfirming(false);
      navigate('/leads');
    } catch {
      // El error ya queda expuesto vía `error` del useApi; el modal sigue abierto.
    }
  };

  return (
    <div data-testid="suppress-lead-button-wrapper">
      <button type="button" data-testid="suppress-lead-open-modal" onClick={handleOpenModal}>
        Eliminar lead
      </button>

      {confirming && (
        <div data-testid="suppress-lead-modal" role="dialog">
          <p>
            Esta acción va a eliminar el lead de forma permanente, junto con sus mensajes, notas y
            visitas agendadas. Esta acción no se puede deshacer.
          </p>
          <p>¿Confirmás que querés eliminar este lead?</p>
          {error && (
            <div data-testid="suppress-lead-error" style={{ color: '#dc2626', fontSize: '13px' }}>
              No se pudo eliminar el lead. Intentá nuevamente.
            </div>
          )}
          <button
            type="button"
            data-testid="suppress-lead-confirm"
            disabled={loading}
            onClick={() => void handleConfirm()}
          >
            {loading ? 'Eliminando...' : 'Sí, eliminar definitivamente'}
          </button>
          <button
            type="button"
            data-testid="suppress-lead-cancel"
            disabled={loading}
            onClick={handleCancel}
          >
            Cancelar
          </button>
        </div>
      )}
    </div>
  );
};
