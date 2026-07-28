import type { Lead } from '@prisma/client';

export type LeadScoreLabel = 'frio' | 'tibio' | 'caliente';

export interface LeadScoreResult {
  score: number;
  label: LeadScoreLabel;
}

/**
 * Pesos del score (spec 09, T1.5, §4.4). Constantes exportadas para poder
 * tunearlas sin tocar la lógica de cálculo.
 */
export const SCORE_WEIGHTS = {
  /** Ya confirmó interés en una ficha concreta (entró a COMMERCIAL_QUALIFICATION). */
  showedInterest: 30,
  timeline: {
    inmediato: 25,
    '1-3 meses': 15,
    '3-6 meses': 5,
    explorando: 0,
  } as Record<string, number>,
  /** Solo aplica con `fOperation === 'SALE'`. */
  paymentMethod: {
    contado: 25,
    credito: 10,
    mixto: 10,
  } as Record<string, number>,
  /** Solo aplica con `fOperation === 'RENT'`. Sin garantía es una señal negativa real. */
  guarantee: {
    propietaria: 20,
    caucion: 20,
    recibo: 10,
    no_tiene: -15,
  } as Record<string, number>,
  buyingSignal: 15,
  hasName: 5,
  declaredBudget: 5,
};

export const HOT_THRESHOLD = 60;
export const WARM_THRESHOLD = 30;

const MIN_SCORE = 0;
const MAX_SCORE = 100;

function labelFor(score: number): LeadScoreLabel {
  if (score >= HOT_THRESHOLD) return 'caliente';
  if (score >= WARM_THRESHOLD) return 'tibio';
  return 'frio';
}

/**
 * Score determinístico del lead (spec 09, T1.5): se calcula SIEMPRE en
 * código a partir de campos ya persistidos — nunca lo decide el LLM (AC-35).
 * Función pura: sin I/O, sin `await`, mismas entradas -> mismo resultado.
 */
export function calculateLeadScore(lead: Lead): LeadScoreResult {
  let score = 0;

  // "Mostró interés en una ficha concreta" (spec §4.4): el único lugar del
  // sistema que puebla `qAskedFields` es CommercialQualificationHandler.enter,
  // que solo se llama cuando el lead confirmó interés en una propiedad
  // mostrada (T1.4). Es la señal persistida más directa disponible.
  // `Array.isArray` igual que en `resolveReleaseState`: un lead traído con un
  // `select` parcial (o un fixture de test viejo) podría llegar sin el campo.
  if (Array.isArray(lead.qAskedFields) && lead.qAskedFields.length > 0) {
    score += SCORE_WEIGHTS.showedInterest;
  }

  if (lead.qTimeline) {
    score += SCORE_WEIGHTS.timeline[lead.qTimeline] ?? 0;
  }

  if (lead.fOperation === 'SALE' && lead.qPaymentMethod) {
    score += SCORE_WEIGHTS.paymentMethod[lead.qPaymentMethod] ?? 0;
  }

  if (lead.fOperation === 'RENT' && lead.qGuarantee) {
    score += SCORE_WEIGHTS.guarantee[lead.qGuarantee] ?? 0;
  }

  // Truthy (no `!== null`): un `undefined` (lead traído sin este campo, p.ej.
  // un `select` parcial) debe tratarse igual que "sin señal", no como señal.
  if (lead.qBuyingSignalAt) {
    score += SCORE_WEIGHTS.buyingSignal;
  }
  if (lead.name) {
    score += SCORE_WEIGHTS.hasName;
  }
  if (lead.fMaxPrice) {
    score += SCORE_WEIGHTS.declaredBudget;
  }

  const clamped = Math.max(MIN_SCORE, Math.min(MAX_SCORE, score));
  return { score: clamped, label: labelFor(clamped) };
}
