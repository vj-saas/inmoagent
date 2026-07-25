import React from 'react';
import { releaseLead } from '../../api/endpoints';
import type { Lead } from '../../api/endpoints';
import { useApi } from '../../hooks/useApi';
import { Button } from '../ui';

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
 * - Al hacer click, invoca `releaseLead`; al resolver, dispara el callback
 *   `onReleased()` para que el padre refetch el lead.
 * - Valida AC-15.
 */
export const ReleaseHandoffButton: React.FC<ReleaseHandoffButtonProps> = ({
  lead,
  tenantId,
  token,
  onReleased,
}) => {
  const { loading, error, run } = useApi(
    releaseLead as unknown as (...args: unknown[]) => Promise<{ released: true }>,
  );

  if (lead.state !== 'HUMAN_HANDOFF') {
    return null;
  }

  const handleClick = async (): Promise<void> => {
    try {
      await run(tenantId, lead.id, token);
      onReleased();
    } catch {
      // El error queda expuesto vía `error` del useApi.
    }
  };

  return (
    <div data-testid="release-handoff-button-container">
      <Button
        data-testid="release-handoff-button"
        onClick={handleClick}
        disabled={loading}
        size="sm"
      >
        {loading ? 'Liberando...' : 'Liberar handoff'}
      </Button>
      {error && (
        <div data-testid="release-handoff-error" className="mt-1 text-sm text-danger">
          No se pudo liberar el handoff. Intentá nuevamente.
        </div>
      )}
    </div>
  );
};
