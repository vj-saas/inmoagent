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

  it.each([
    'quiero hablar con una persona',
    'quiero hablar con un humano',
    'atendeme porfa',
    'quiero un asesor',
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
});
