import { Injectable } from '@nestjs/common';
import { ConversationState, type Lead } from '@prisma/client';
import type { GuardrailAction } from './guardrails.types';

/** Comandos cortos de baja: solo si el mensaje EMPIEZA con ellos ("BAJA", "stop"). */
const OPT_OUT_COMMAND = /^(baja|stop|no molestar|no me escribas)\b/i;

/**
 * Frases inequívocas de baja en cualquier parte del mensaje ("la verdad ya no
 * estoy buscando, no quiero que me escriban más por favor"). Sin esto, el bot
 * seguía vendiendo después de un pedido explícito de no contacto (QA personas §2).
 */
const OPT_OUT_PHRASES = [
  /no (me|nos) escrib(as|an|a) m[aá]s/i,
  /no (quiero|queremos) que me escriban/i,
  /no me mand(es|en) m[aá]s/i,
  /dej(a|en|ame|á) de escribir(me|nos)?/i,
  /no quiero recibir m[aá]s mensajes/i,
  /borr(a|en|ame|áme|ame) (de la lista|mis datos)/i,
  /dar(me)? de baja|darme la baja|quiero la baja/i,
];

const HANDOFF_PATTERNS = [
  /hablar con (una persona|un humano|alguien|un asesor|un agente|un vendedor)/i,
  /atend[ée]me\b/i,
  /que me atienda (una persona|un humano|alguien)/i,
  /quiero (un|hablar con un) asesor/i,
  /pasa(me|rme) con (alguien|una persona|un humano|un asesor|la oficina)/i,
  /comunica(me|rme) con (alguien|una persona|un humano|un asesor|la oficina)/i,
  /persona (real|de carne y hueso)/i,
  /no (quiero|me gusta) hablar con (un |el |los )?(bots?|robots?|m[aá]quinas?|asistentes? virtuales?)/i,
];

const HANDOFF_TIMEOUT_MS = 48 * 60 * 60 * 1000;

/**
 * Guardrails de código, evaluados ANTES de invocar al LLM, en el orden de
 * docs/03-CONVERSACION.md §3: opt-out → handoff explícito → estado silenciado.
 * (El guardrail de "mensaje no soportado" ya se resolvió en la Fase 3, en
 * `InboundProcessor`, antes de que el turno llegue acá.)
 */
@Injectable()
export class GuardrailsService {
  evaluate(lead: Lead, turnText: string): GuardrailAction {
    const trimmed = turnText.trim();

    if (
      lead.state !== ConversationState.OPTED_OUT &&
      (OPT_OUT_COMMAND.test(trimmed) ||
        OPT_OUT_PHRASES.some((pattern) => pattern.test(trimmed)))
    ) {
      return { type: 'opt_out' };
    }

    if (
      lead.state !== ConversationState.HUMAN_HANDOFF &&
      lead.state !== ConversationState.OPTED_OUT &&
      HANDOFF_PATTERNS.some((pattern) => pattern.test(trimmed))
    ) {
      return { type: 'handoff' };
    }

    if (lead.state === ConversationState.OPTED_OUT) {
      return { type: 'silenced' };
    }

    if (lead.state === ConversationState.HUMAN_HANDOFF) {
      return this.isHandoffTimedOut(lead.handoffAt)
        ? { type: 'handoff_timeout_release' }
        : { type: 'silenced' };
    }

    return { type: 'continue' };
  }

  private isHandoffTimedOut(handoffAt: Date | null): boolean {
    if (!handoffAt) {
      // No debería pasar con state=HUMAN_HANDOFF, pero mejor liberar que dejar el lead colgado para siempre.
      return true;
    }
    return Date.now() - handoffAt.getTime() >= HANDOFF_TIMEOUT_MS;
  }
}
