import { ConversationState, type Lead } from '@prisma/client';
import { GuardrailsService } from './guardrails.service';

function lead(overrides: Partial<Lead>): Lead {
  return {
    id: 'lead-1',
    tenantId: 'tenant-1',
    phone: '5491100000000',
    name: null,
    state: ConversationState.QUALIFICATION,
    fOperation: null,
    fNeighborhoods: [],
    fMaxPrice: null,
    fCurrency: null,
    fMinRooms: null,
    fGarage: null,
    fPetsAllowed: null,
    fNotes: null,
    fPreferredDay: null,
    fOfferedNeighborhoods: [],
    fPriceMentionedAtTurn: null,
    handoffAt: null,
    optedOutAt: null,
    lastMessageAt: null,
    greetedAt: null,
    lastSearchIds: [],
    turnCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('GuardrailsService', () => {
  const service = new GuardrailsService();

  it.each(['BAJA', 'baja', 'Stop', 'no molestar', 'No me escribas más'])(
    '"%s" dispara opt_out en un lead activo',
    (text) => {
      expect(
        service.evaluate(
          lead({ state: ConversationState.QUALIFICATION }),
          text,
        ),
      ).toEqual({ type: 'opt_out' });
    },
  );

  it('no reactiva opt_out en un lead ya OPTED_OUT (queda silenciado, no reenvía confirmación)', () => {
    expect(
      service.evaluate(lead({ state: ConversationState.OPTED_OUT }), 'BAJA'),
    ).toEqual({ type: 'silenced' });
  });

  // spec 09, T1.4, AC-32: los guardrails no distinguen por estado (solo
  // OPTED_OUT/HUMAN_HANDOFF tienen rama propia) — un lead en el nuevo estado
  // COMMERCIAL_QUALIFICATION se intercepta exactamente igual que en cualquier
  // otro estado "activo".
  it('AC-32: BAJA y pedido de humano interceptan igual estando en COMMERCIAL_QUALIFICATION', () => {
    expect(
      service.evaluate(
        lead({ state: ConversationState.COMMERCIAL_QUALIFICATION }),
        'BAJA',
      ),
    ).toEqual({ type: 'opt_out' });
    expect(
      service.evaluate(
        lead({ state: ConversationState.COMMERCIAL_QUALIFICATION }),
        'quiero hablar con una persona',
      ),
    ).toEqual({ type: 'handoff' });
  });

  it.each([
    'quiero hablar con una persona',
    'quiero hablar con un humano',
    'atendeme porfa',
    'quiero un asesor',
    'contactame un asesor',
    'contactame con un asesor',
    'contactenme con alguien de la oficina',
  ])('"%s" dispara handoff en un lead activo', (text) => {
    expect(
      service.evaluate(lead({ state: ConversationState.QUALIFICATION }), text),
    ).toEqual({ type: 'handoff' });
  });

  it('no reactiva handoff si el lead ya está en HUMAN_HANDOFF vigente (queda silenciado)', () => {
    const recentHandoff = lead({
      state: ConversationState.HUMAN_HANDOFF,
      handoffAt: new Date(),
    });
    expect(
      service.evaluate(recentHandoff, 'quiero hablar con una persona'),
    ).toEqual({ type: 'silenced' });
  });

  it('un lead OPTED_OUT queda silenciado para cualquier texto', () => {
    expect(
      service.evaluate(
        lead({ state: ConversationState.OPTED_OUT }),
        'hola de nuevo',
      ),
    ).toEqual({
      type: 'silenced',
    });
  });

  it('un lead en HUMAN_HANDOFF reciente queda silenciado', () => {
    const recentHandoff = lead({
      state: ConversationState.HUMAN_HANDOFF,
      handoffAt: new Date(),
    });
    expect(service.evaluate(recentHandoff, 'hola, alguien ahí?')).toEqual({
      type: 'silenced',
    });
  });

  it('un lead en HUMAN_HANDOFF con más de 48hs se libera (handoff_timeout_release)', () => {
    const oldHandoff = lead({
      state: ConversationState.HUMAN_HANDOFF,
      handoffAt: new Date(Date.now() - 50 * 60 * 60 * 1000),
    });
    expect(service.evaluate(oldHandoff, 'hola, siguen ahí?')).toEqual({
      type: 'handoff_timeout_release',
    });
  });

  it('deja continuar el flujo normal si ningún guardrail matchea', () => {
    expect(
      service.evaluate(
        lead({ state: ConversationState.QUALIFICATION }),
        'busco depto en caballito',
      ),
    ).toEqual({
      type: 'continue',
    });
  });

  it('no confunde "atender" o "asesorar" sueltos con un pedido de handoff', () => {
    expect(
      service.evaluate(lead({}), 'quiero que me asesoren sobre el barrio'),
    ).toEqual({ type: 'continue' });
  });

  // QA personas §2: pedidos de baja "suaves" (sin BAJA/STOP al inicio).
  it.each([
    'la verdad ya no estoy buscando, no quiero que me escriban mas por favor',
    'che no me escriban más',
    'dejen de escribirme',
    'no quiero recibir más mensajes gracias',
    'quiero darme de baja',
  ])('"%s" dispara opt_out aunque no empiece con la palabra clave', (text) => {
    expect(service.evaluate(lead({}), text)).toEqual({ type: 'opt_out' });
  });

  it('no confunde una frase que contiene "baja" con un opt-out ("planta baja")', () => {
    expect(service.evaluate(lead({}), 'busco un depto en planta baja')).toEqual(
      { type: 'continue' },
    );
  });

  // QA personas §3: pedidos de humano "suaves".
  it.each([
    'mmm mejor pasame con alguien de la oficina, no me gusta hablar con robots',
    'QUE ME ATIENDA UNA PERSONA DE CARNE Y HUESO',
    'quiero hablar con un asesor',
    'comunicame con una persona por favor',
    'no quiero hablar con un bot',
  ])('"%s" dispara handoff', (text) => {
    expect(service.evaluate(lead({}), text)).toEqual({ type: 'handoff' });
  });

  /**
   * AC-6 [CRÍTICO] — `HUMAN_HANDOFF` originado por el envío manual del asesor
   * (`AdminLeadMessagingService.sendManual`, T8), no por un pedido del lead.
   *
   * DECISIÓN DOCUMENTADA: el AC **no distingue** el origen del handoff. El
   * único rastro que `sendManual` deja en el lead es exactamente el mismo que
   * deja el guardrail `handoff` cuando el lead pide un humano:
   * `state = HUMAN_HANDOFF` + `handoffAt = <ahora>`. No hay columna de origen
   * ni la habrá: el gating de `GuardrailsService` es por ESTADO, nunca por
   * cómo se llegó a él, así que los dos orígenes están cubiertos por la misma
   * lógica y estos tests valen para ambos. Si algún día se necesitara
   * diferenciarlos (métricas, copy distinto), sería un cambio de schema, no de
   * este guardrail.
   */
  describe('AC-6 — handoff originado por `send` del asesor (T8)', () => {
    /** Lead tal cual lo deja `sendManual`: HUMAN_HANDOFF + handoffAt = ahora. */
    function handoffBySendManual(overrides: Partial<Lead> = {}): Lead {
      return lead({
        state: ConversationState.HUMAN_HANDOFF,
        handoffAt: new Date(),
        // El asesor suele tomar la conversación a mitad del flujo: el lead
        // venía de ver fichas y con filtros cargados.
        lastSearchIds: ['prop-1', 'prop-2'],
        turnCount: 7,
        ...overrides,
      });
    }

    it.each([
      'me interesa el segundo, cuánto son las expensas?',
      'dale, mañana a la tarde puedo',
      'hola',
      'gracias!!',
      '¿todavía está disponible el de Caballito?',
    ])(
      '"%s" (sin ninguna frase de handoff) queda silenciado: el asesor ya tomó la conversación',
      (text) => {
        expect(service.evaluate(handoffBySendManual(), text)).toEqual({
          type: 'silenced',
        });
      },
    );

    it('silencia también un turno vacío o de solo espacios (no cae en `continue`)', () => {
      expect(service.evaluate(handoffBySendManual(), '   ')).toEqual({
        type: 'silenced',
      });
      expect(service.evaluate(handoffBySendManual(), '')).toEqual({
        type: 'silenced',
      });
    });

    it('no dispara un handoff nuevo si el lead además pide un humano (ya está con uno)', () => {
      expect(
        service.evaluate(
          handoffBySendManual(),
          'quiero hablar con una persona real',
        ),
      ).toEqual({ type: 'silenced' });
    });

    // AC-2: el opt-out es la única puerta que sigue abierta en modo manual. Un
    // "BAJA" durante una conversación tomada por el asesor NO puede quedar
    // silenciado: es una obligación legal, no una respuesta del bot.
    it.each(['BAJA', 'no me escriban más'])(
      '"%s" sigue disparando opt_out aunque el asesor haya tomado la conversación',
      (text) => {
        expect(service.evaluate(handoffBySendManual(), text)).toEqual({
          type: 'opt_out',
        });
      },
    );

    it('se libera por timeout a las 48hs exactas del `send` (borde inclusive)', () => {
      const stale = handoffBySendManual({
        handoffAt: new Date(Date.now() - 48 * 60 * 60 * 1000),
      });
      expect(service.evaluate(stale, 'hola, alguna novedad?')).toEqual({
        type: 'handoff_timeout_release',
      });
    });

    it('sigue silenciado justo antes de las 48hs del `send`', () => {
      const almostStale = handoffBySendManual({
        handoffAt: new Date(Date.now() - 47.5 * 60 * 60 * 1000),
      });
      expect(service.evaluate(almostStale, 'hola, alguna novedad?')).toEqual({
        type: 'silenced',
      });
    });

    it('el lead vuelve al bot si el asesor abandonó la conversación por más de 48hs', () => {
      const abandoned = handoffBySendManual({
        handoffAt: new Date(Date.now() - 72 * 60 * 60 * 1000),
      });
      expect(service.evaluate(abandoned, 'siguen ahí?')).toEqual({
        type: 'handoff_timeout_release',
      });
    });

    // `sendManual` siempre escribe `handoffAt`, pero un lead migrado o tocado a
    // mano en la DB no puede quedar mudo para siempre: sin timestamp se libera.
    it('libera (no silencia) un HUMAN_HANDOFF sin handoffAt', () => {
      const noTimestamp = handoffBySendManual({ handoffAt: null });
      expect(service.evaluate(noTimestamp, 'hola?')).toEqual({
        type: 'handoff_timeout_release',
      });
    });
  });
});

/**
 * Expiración de sesión por tiempo real (spec 10, §2): a diferencia de
 * `isPriceStale` (que mide turnos), este chequeo mide `lastMessageAt` contra
 * el reloj real, mismo criterio que ya usa `isHandoffTimedOut` para el
 * timeout de 48hs.
 */
describe('GuardrailsService — expiración de sesión por tiempo real (spec 10)', () => {
  const service = new GuardrailsService();
  const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

  it('un lead activo con más de 30 días de inactividad dispara session_expired', () => {
    const stale = lead({
      state: ConversationState.QUALIFICATION,
      lastMessageAt: new Date(Date.now() - THIRTY_DAYS_MS - 1000),
    });
    expect(service.evaluate(stale, 'hola, siguen ahí?')).toEqual({
      type: 'session_expired',
    });
  });

  it('exactamente 30 días cuenta como expirado (borde inclusive, mismo criterio que el timeout de handoff)', () => {
    const atThreshold = lead({
      state: ConversationState.SEARCH_MATCH,
      lastMessageAt: new Date(Date.now() - THIRTY_DAYS_MS),
    });
    expect(service.evaluate(atThreshold, 'hola')).toEqual({
      type: 'session_expired',
    });
  });

  it('un lead activo reciente (< 30 días) NO expira', () => {
    const recent = lead({
      state: ConversationState.QUALIFICATION,
      lastMessageAt: new Date(Date.now() - THIRTY_DAYS_MS + 60_000),
    });
    expect(service.evaluate(recent, 'hola')).toEqual({ type: 'continue' });
  });

  it('un lead sin lastMessageAt (recién creado) nunca expira', () => {
    const brandNew = lead({
      state: ConversationState.GREETING,
      lastMessageAt: null,
    });
    expect(service.evaluate(brandNew, 'hola')).toEqual({ type: 'continue' });
  });

  it('BAJA sigue ganando sobre una sesión vieja (opt-out explícito tiene prioridad)', () => {
    const stale = lead({
      state: ConversationState.QUALIFICATION,
      lastMessageAt: new Date(Date.now() - THIRTY_DAYS_MS - 1000),
    });
    expect(service.evaluate(stale, 'BAJA')).toEqual({ type: 'opt_out' });
  });

  it('un pedido explícito de humano sigue ganando sobre una sesión vieja', () => {
    const stale = lead({
      state: ConversationState.QUALIFICATION,
      lastMessageAt: new Date(Date.now() - THIRTY_DAYS_MS - 1000),
    });
    expect(service.evaluate(stale, 'quiero hablar con una persona')).toEqual({
      type: 'handoff',
    });
  });

  it('OPTED_OUT sigue silenciado aunque lastMessageAt sea viejo (no revive el guardrail de expiración)', () => {
    const staleOptedOut = lead({
      state: ConversationState.OPTED_OUT,
      lastMessageAt: new Date(Date.now() - THIRTY_DAYS_MS - 1000),
    });
    expect(service.evaluate(staleOptedOut, 'hola')).toEqual({
      type: 'silenced',
    });
  });

  it('HUMAN_HANDOFF sigue resolviéndose por su propio timeout de 48hs, no por el de 30 días', () => {
    const staleHandoff = lead({
      state: ConversationState.HUMAN_HANDOFF,
      handoffAt: new Date(Date.now() - THIRTY_DAYS_MS - 1000),
      lastMessageAt: new Date(Date.now() - THIRTY_DAYS_MS - 1000),
    });
    expect(service.evaluate(staleHandoff, 'hola')).toEqual({
      type: 'handoff_timeout_release',
    });
  });
});
