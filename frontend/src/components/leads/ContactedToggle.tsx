import React from 'react';
import { markContacted, markUncontacted, type Lead } from '../../api/endpoints';
import { useApi } from '../../hooks/useApi';

export interface ContactedToggleProps {
  lead: Lead;
  tenantId: string;
  token: string;
  /**
   * Callback invocado con el lead actualizado cuando el estado de contacto
   * cambia exitosamente. Permite al padre reflejar el nuevo estado sin recargar.
   */
  onUpdated: (lead: Lead) => void;
}

/**
 * Botón/checkbox para marcar un lead como "contactado" o "no contactado".
 *
 * - Si `lead.contactedAt` es null, el click invoca `markContacted` (AC-9).
 * - Si `lead.contactedAt` tiene valor, el click invoca `markUncontacted` (AC-10).
 * - Al recibir el lead actualizado, invoca `onUpdated(lead)` para reflejar
 *   el nuevo estado sin recargar la página (AC-11).
 */
export const ContactedToggle: React.FC<ContactedToggleProps> = ({
  lead,
  tenantId,
  token,
  onUpdated,
}) => {
  const isContacted = lead.contactedAt !== null;

  const { loading, error, run: runMarkContacted } = useApi(
    markContacted as unknown as (...args: unknown[]) => Promise<Lead>,
  );

  const { loading: uncontactedLoading, error: uncontactedError, run: runMarkUncontacted } = useApi(
    markUncontacted as unknown as (...args: unknown[]) => Promise<Lead>,
  );

  const isLoading = loading || uncontactedLoading;
  const apiError = error || uncontactedError;

  const handleToggle = async (): Promise<void> => {
    try {
      if (isContacted) {
        const updatedLead = await runMarkUncontacted(tenantId, lead.id, token);
        onUpdated(updatedLead);
      } else {
        const updatedLead = await runMarkContacted(tenantId, lead.id, token);
        onUpdated(updatedLead);
      }
    } catch {
      // El error ya queda expuesto vía `error` del useApi.
    }
  };

  return (
    <div data-testid="contacted-toggle">
      <button
        type="button"
        data-testid="contacted-toggle-btn"
        onClick={() => void handleToggle()}
        disabled={isLoading}
      >
        {isLoading ? 'Actualizando...' : isContacted ? 'Marcar como no contactado' : 'Marcar como contactado'}
      </button>

      {apiError && (
        <div data-testid="contacted-toggle-error" style={{ color: '#dc2626', fontSize: '13px', marginTop: '4px' }}>
          No se pudo actualizar el estado. Intentá nuevamente.
        </div>
      )}
    </div>
  );
};
