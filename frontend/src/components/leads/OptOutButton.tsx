import React from 'react';
import { optOutLead } from '../../api/endpoints';
import type { Lead } from '../../api/endpoints';
import { useApi } from '../../hooks/useApi';
import { Button } from '../ui';

export interface OptOutButtonProps {
  lead: Lead;
  tenantId: string;
  token: string;
  /**
   * Callback invocado con el lead actualizado devuelto por el backend
   * (idempotente si ya estaba `OPTED_OUT`).
   */
  onUpdated: (lead: Lead) => void;
}

/**
 * Botón para marcar manualmente a un lead como `OPTED_OUT` (regla 6 de
 * CLAUDE.md, disparada desde el admin en vez de por mensaje del lead).
 *
 * - Oculto si `lead.state === 'OPTED_OUT'` (AC-16/AC-17: no tiene sentido
 *   volver a invocar una acción ya aplicada, y el backend es idempotente de
 *   todos modos).
 * - Confirmación elegida: `window.confirm` con un texto breve en español.
 *   Es una acción sensible (deja de escribírsele al lead) pero reversible
 *   por el equipo (a diferencia de `SuppressLeadButton`, que borra datos):
 *   no amerita un modal de dos pasos, alcanza con la confirmación nativa del
 *   navegador para evitar clicks accidentales.
 */
export const OptOutButton: React.FC<OptOutButtonProps> = ({ lead, tenantId, token, onUpdated }) => {
  const { loading, error, run } = useApi(
    optOutLead as unknown as (...args: unknown[]) => Promise<Lead>,
  );

  if (lead.state === 'OPTED_OUT') {
    return null;
  }

  const handleClick = async (): Promise<void> => {
    const confirmed = window.confirm(
      '¿Marcar a este lead como dado de baja (opt-out)? No se le volverá a escribir.',
    );
    if (!confirmed) return;

    try {
      const updated = await run(tenantId, lead.id, token);
      onUpdated(updated);
    } catch {
      // El error ya queda expuesto vía `error` del useApi.
    }
  };

  return (
    <div data-testid="opt-out-button-wrapper">
      <Button
        type="button"
        data-testid="opt-out-button"
        disabled={loading}
        onClick={() => void handleClick()}
        variant="danger"
        size="sm"
      >
        {loading ? 'Procesando...' : 'Marcar como baja (opt-out)'}
      </Button>
      {error && (
        <div data-testid="opt-out-button-error" className="mt-1 text-sm text-danger">
          No se pudo dar de baja al lead. Intentá nuevamente.
        </div>
      )}
    </div>
  );
};
