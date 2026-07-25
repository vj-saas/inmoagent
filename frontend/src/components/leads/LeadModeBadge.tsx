import React from 'react';
import { Badge } from '../ui';

/**
 * Modo de un lead, derivado de su `ConversationState` real (ver
 * `prisma/schema.prisma`). Es la única fuente de verdad para "quién le está
 * respondiendo al lead" en el frontend; `LeadDetailPage`, `LeadRow` y
 * `ManualReplyBox` reusan `resolveLeadMode` en vez de reimplementar el mapeo.
 */
export type LeadMode = 'MANUAL' | 'OPTED_OUT' | 'AI';

/**
 * Deriva el modo de un lead a partir de su estado de conversación.
 *
 * Orden de evaluación (no cambiar): `HUMAN_HANDOFF` → MANUAL primero,
 * después `OPTED_OUT`. Cualquier otro estado (incluido uno desconocido que
 * la FSM agregue en el futuro) cae en 'AI' por default seguro, sin enumerar
 * el resto de los estados uno por uno.
 */
export function resolveLeadMode(state: string): LeadMode {
  if (state === 'HUMAN_HANDOFF') {
    return 'MANUAL';
  }
  if (state === 'OPTED_OUT') {
    return 'OPTED_OUT';
  }
  return 'AI';
}

const MODE_LABELS: Record<LeadMode, string> = {
  MANUAL: 'Respondiendo vos',
  OPTED_OUT: 'Dado de baja',
  AI: 'Agente IA activo',
};

const MODE_TONES: Record<LeadMode, 'warning' | 'danger' | 'success'> = {
  MANUAL: 'warning',
  OPTED_OUT: 'danger',
  AI: 'success',
};

export interface LeadModeBadgeProps {
  /** `ConversationState` del lead (string para no acoplar a la forma completa del tipo). */
  state: string;
}

export const LeadModeBadge: React.FC<LeadModeBadgeProps> = ({ state }) => {
  const mode = resolveLeadMode(state);
  return (
    <Badge data-testid="lead-mode-badge" tone={MODE_TONES[mode]}>
      {MODE_LABELS[mode]}
    </Badge>
  );
};
