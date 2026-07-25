/**
 * Card de estado del webhook de WhatsApp (paso de onboarding / config final).
 *
 * Llama a `getWebhookStatus` al montar y clasifica el resultado en 3 estados
 * de UI:
 * - "inactive": nunca vimos tráfico entrante (`connected === false` y
 *   `lastEventAt === null`).
 * - "pending": el backend nos dice que hubo tráfico alguna vez, pero
 *   `lastEventAt` es más viejo que `RECENT_EVENT_THRESHOLD_MS` (heurística de
 *   UI, no viene del backend — ver comentario abajo).
 * - "active": `connected === true` y `lastEventAt` está dentro del umbral.
 *
 * IMPORTANTE (decisión de producto): `connected: true` solo significa "vimos
 * tráfico entrante alguna vez (o recientemente)". El backend NO puede
 * verificar activamente contra la API de Meta que el webhook esté bien
 * suscripto en el WABA del tenant, solo puede inferirlo por los eventos que
 * efectivamente llegaron. Este componente deja esto explícito en todo
 * momento para que el usuario no asuma que "conectado" implica que Meta ya
 * validó la configuración.
 */

import { useEffect } from 'react';
import { getWebhookStatus } from '../../api/endpoints';
import type { WebhookStatusResponse } from '../../api/endpoints';
import { useApi } from '../../hooks/useApi';
import { Spinner } from '../Spinner';
import { ErrorBanner } from '../ErrorBanner';

export interface WebhookStatusCardProps {
  tenantId: string;
  token: string;
}

// Heurística de UI, no viene del backend: si el último evento entrante tiene
// más de 24hs, lo tratamos como "sin eventos recientes" aunque `connected`
// siga en `true`.
const RECENT_EVENT_THRESHOLD_MS = 24 * 60 * 60 * 1000;

type WebhookUiState = 'active' | 'inactive' | 'pending';

function formatDateTime(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleString('es-AR');
}

function resolveUiState(status: WebhookStatusResponse): WebhookUiState {
  if (!status.connected || !status.lastEventAt) {
    return 'inactive';
  }

  const lastEventMs = new Date(status.lastEventAt).getTime();
  const isRecent = Date.now() - lastEventMs <= RECENT_EVENT_THRESHOLD_MS;

  return isRecent ? 'active' : 'pending';
}

const STATE_COPY: Record<WebhookUiState, string> = {
  inactive:
    'Todavía no recibimos ningún mensaje en este número. Verificá la configuración del webhook en Meta.',
  pending:
    'Recibimos tráfico anteriormente, pero no en las últimas 24 horas. Verificá que el webhook siga activo.',
  active: 'El webhook está recibiendo mensajes correctamente.',
};

function errorMessage(err: Error): string {
  return err.message || 'Ocurrió un error inesperado.';
}

export function WebhookStatusCard({ tenantId, token }: WebhookStatusCardProps): JSX.Element {
  const { loading, error, data, run } = useApi<WebhookStatusResponse>(
    getWebhookStatus as (...args: unknown[]) => Promise<WebhookStatusResponse>,
  );

  useEffect(() => {
    if (!tenantId || !token) return;
    run(tenantId, token).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, token]);

  return (
    <div className="webhook-status-card" data-testid="webhook-status-card">
      <div className="webhook-status-card-header">
        <span className="webhook-status-card-title">Estado del webhook</span>
      </div>

      {loading && <Spinner text="Consultando estado del webhook..." />}

      {!loading && error && <ErrorBanner message={errorMessage(error)} />}

      {!loading && !error && data && (
        <>
          {(() => {
            const state = resolveUiState(data);
            return (
              <span
                className={`webhook-status-indicator webhook-status-indicator--${state}`}
                data-testid="webhook-status-indicator"
              >
                <span className="webhook-status-dot" />
                {STATE_COPY[state]}
              </span>
            );
          })()}

          <div className="webhook-status-info">
            <div className="webhook-status-info-item">
              <span className="webhook-status-info-label">Último evento recibido</span>
              <span className="webhook-status-info-value">{formatDateTime(data.lastEventAt)}</span>
            </div>
            <div className="webhook-status-info-item">
              <span className="webhook-status-info-label">Último mensaje procesado</span>
              <span className="webhook-status-info-value">
                {formatDateTime(data.lastMessageAt)}
              </span>
            </div>
          </div>
        </>
      )}

      <p className="webhook-status-info" data-testid="webhook-status-disclaimer">
        "Conectado" significa que vimos tráfico entrante en este número, no que Meta haya
        confirmado la suscripción del webhook en la configuración de la aplicación.
      </p>
    </div>
  );
}
