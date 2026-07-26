import React, { useEffect, useMemo, useState } from 'react';
import { sendManualMessage } from '../../api/endpoints';
import type { Lead } from '../../api/endpoints';
import { useApi } from '../../hooks/useApi';
import { Button, useToast } from '../ui';
import { resolveLeadMode } from './LeadModeBadge';

/** Ventana de servicio de WhatsApp: 24hs desde el último mensaje IN (ver spec, decisión 4). */
const WINDOW_HOURS = 24;
const WINDOW_MS = WINDOW_HOURS * 60 * 60 * 1000;
/** Refresco del remanente mostrado al asesor (no necesita ser más fino que esto). */
const TICK_MS = 60_000;

/**
 * Calcula los milisegundos restantes de ventana de servicio a partir de
 * `lastInboundAt`. `null` (nunca hubo un IN) se trata como ventana vencida.
 */
function computeRemainingMs(lastInboundAt: string | null, now: number): number {
  if (!lastInboundAt) {
    return 0;
  }
  const expiresAt = new Date(lastInboundAt).getTime() + WINDOW_MS;
  return Math.max(0, expiresAt - now);
}

/** Formatea un remanente en ms como "quedan 3 h 12 m" (AC-18). */
function formatRemaining(remainingMs: number): string {
  const totalMinutes = Math.floor(remainingMs / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `quedan ${hours} h ${minutes} m`;
}

export interface ManualReplyBoxProps {
  lead: Lead;
  tenantId: string;
  token: string;
  /** Callback invocado tras un envío exitoso (AC-16). El padre refetchea lead + mensajes. */
  onSent: () => void;
}

/**
 * Caja de envío de texto libre de un asesor humano hacia un lead.
 *
 * - Muestra el remanente de la ventana de servicio de 24hs (AC-18),
 *   recalculado cada `TICK_MS` con `setInterval`.
 * - Se deshabilita con copy explicativo si la ventana venció o si
 *   `resolveLeadMode(lead.state) === 'OPTED_OUT'` (AC-19), sin esperar al
 *   409 del backend.
 * - Al enviar con éxito: `showToast` + `onSent()` (AC-16). Ante error
 *   (incluido un 409 por reloj desfasado del cliente) el texto tipeado NO
 *   se limpia, para que el asesor no lo pierda.
 */
export const ManualReplyBox: React.FC<ManualReplyBoxProps> = ({
  lead,
  tenantId,
  token,
  onSent,
}) => {
  const [text, setText] = useState('');
  const [now, setNow] = useState(() => Date.now());
  const { showToast } = useToast();
  const { loading, run } = useApi(
    sendManualMessage as unknown as (...args: unknown[]) => Promise<{ message: unknown; lead: Lead }>,
  );

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(interval);
  }, []);

  const remainingMs = useMemo(
    () => computeRemainingMs(lead.lastInboundAt, now),
    [lead.lastInboundAt, now],
  );
  const windowExpired = remainingMs <= 0;
  const optedOut = resolveLeadMode(lead.state) === 'OPTED_OUT';
  const disabled = windowExpired || optedOut || loading;
  const canSend = text.trim().length > 0 && !disabled;

  const handleSend = async (): Promise<void> => {
    if (!canSend) {
      return;
    }
    try {
      await run(tenantId, lead.id, text, token);
      setText('');
      showToast('Mensaje enviado', 'success');
      onSent();
    } catch {
      // El texto tipeado se preserva; el asesor puede reintentar sin volver a escribirlo.
    }
  };

  return (
    <div data-testid="manual-reply-box">
      {optedOut ? (
        <p data-testid="manual-reply-disabled-reason" className="text-sm text-danger">
          Este lead se dio de baja. No se le puede enviar texto libre.
        </p>
      ) : windowExpired ? (
        <p data-testid="manual-reply-disabled-reason" className="text-sm text-danger">
          Venció la ventana de 24hs de servicio. No se puede enviar texto libre hasta que el lead
          escriba de nuevo.
        </p>
      ) : (
        <p data-testid="manual-reply-window" className="text-sm text-text-muted">
          {formatRemaining(remainingMs)} de ventana de servicio
        </p>
      )}

      <textarea
        data-testid="manual-reply-textarea"
        className="mt-2 w-full rounded border border-border bg-surface p-2 text-sm text-text disabled:cursor-not-allowed disabled:opacity-50"
        rows={3}
        value={text}
        disabled={disabled}
        onChange={(event) => setText(event.target.value)}
        placeholder="Escribí tu respuesta..."
      />

      <div className="mt-2 flex justify-end">
        <Button
          data-testid="manual-reply-send"
          type="button"
          size="sm"
          disabled={!canSend}
          loading={loading}
          onClick={() => void handleSend()}
        >
          Enviar
        </Button>
      </div>
    </div>
  );
};
