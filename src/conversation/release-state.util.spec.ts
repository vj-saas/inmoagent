import { ConversationState, OperationType, type Lead } from '@prisma/client';
import { resolveReleaseState } from './release-state.util';

/**
 * El util solo consume `lastSearchIds` (ver comentario de la firma), pero los
 * casos incluyen `fOperation` a propósito para probar que NO participa del
 * cálculo. Se tipa el fixture en vez de pasar un literal inline para no chocar
 * con el excess property check de TS contra `Pick<Lead, 'lastSearchIds'>`.
 */
type ReleaseLeadFixture = Pick<Lead, 'lastSearchIds' | 'fOperation'>;

function lead(overrides: Partial<ReleaseLeadFixture> = {}): ReleaseLeadFixture {
  return {
    lastSearchIds: [],
    fOperation: null,
    ...overrides,
  };
}

/** Estados a los que un release NUNCA puede devolver un lead (spec V-B2, decisión 5). */
const FORBIDDEN_STATES = [
  ConversationState.GREETING, // el aviso Ley 25.326 ya se mandó (greetedAt), no se repite
  ConversationState.HUMAN_HANDOFF, // liberar a handoff sería un no-op: bot silenciado para siempre
  ConversationState.OPTED_OUT, // la baja es siempre decisión del lead, no de un release
] as const;

describe('resolveReleaseState (FSM: estado de retorno al salir de HUMAN_HANDOFF)', () => {
  it('AC-8: con al menos un id en lastSearchIds vuelve a SEARCH_MATCH', () => {
    expect(resolveReleaseState(lead({ lastSearchIds: ['prop_1'] }))).toBe(
      ConversationState.SEARCH_MATCH,
    );
    expect(
      resolveReleaseState(lead({ lastSearchIds: ['prop_1', 'prop_2'] })),
    ).toBe(ConversationState.SEARCH_MATCH);
  });

  it('AC-9: con lastSearchIds vacío y sin fOperation vuelve a QUALIFICATION', () => {
    expect(
      resolveReleaseState(lead({ lastSearchIds: [], fOperation: null })),
    ).toBe(ConversationState.QUALIFICATION);
  });

  it('AC-9: con lastSearchIds vacío y fOperation seteado vuelve a QUALIFICATION igual (fOperation no participa)', () => {
    for (const operation of [
      OperationType.SALE,
      OperationType.RENT,
      OperationType.TEMP_RENT,
    ]) {
      expect(
        resolveReleaseState(lead({ lastSearchIds: [], fOperation: operation })),
      ).toBe(ConversationState.QUALIFICATION);
    }
  });

  it('AC-9: el resultado con lastSearchIds vacío es idéntico con y sin fOperation', () => {
    expect(
      resolveReleaseState(lead({ lastSearchIds: [], fOperation: null })),
    ).toBe(
      resolveReleaseState(
        lead({ lastSearchIds: [], fOperation: OperationType.SALE }),
      ),
    );
  });

  it('lastSearchIds manda por sobre fOperation: no vacío -> SEARCH_MATCH aunque no haya fOperation', () => {
    expect(
      resolveReleaseState(lead({ lastSearchIds: ['prop_1'], fOperation: null })),
    ).toBe(ConversationState.SEARCH_MATCH);
  });

  it('[CRÍTICO] nunca devuelve GREETING, HUMAN_HANDOFF ni OPTED_OUT para ninguna combinación de entradas', () => {
    const inputs: ReleaseLeadFixture[] = [
      lead({ lastSearchIds: [], fOperation: null }),
      lead({ lastSearchIds: [], fOperation: OperationType.SALE }),
      lead({ lastSearchIds: [], fOperation: OperationType.RENT }),
      lead({ lastSearchIds: [], fOperation: OperationType.TEMP_RENT }),
      lead({ lastSearchIds: ['prop_1'], fOperation: null }),
      lead({ lastSearchIds: ['prop_1'], fOperation: OperationType.SALE }),
      lead({ lastSearchIds: ['a', 'b', 'c'], fOperation: OperationType.RENT }),
    ];

    for (const input of inputs) {
      const result = resolveReleaseState(input);
      expect(FORBIDDEN_STATES).not.toContain(result);
      // y el resultado siempre es uno de los dos estados permitidos
      expect([
        ConversationState.SEARCH_MATCH,
        ConversationState.QUALIFICATION,
      ]).toContain(result);
    }
  });

  it('es determinística y pura: mismas entradas -> mismo resultado, y no muta el lead', () => {
    const input = lead({
      lastSearchIds: ['prop_1'],
      fOperation: OperationType.SALE,
    });
    const snapshot = JSON.stringify(input);

    const first = resolveReleaseState(input);
    const second = resolveReleaseState(input);

    expect(second).toBe(first);
    expect(JSON.stringify(input)).toBe(snapshot);
  });

  it('degrada a QUALIFICATION (no lanza) si lastSearchIds no vino en un select parcial', () => {
    const partial = {} as Pick<Lead, 'lastSearchIds'>;
    expect(resolveReleaseState(partial)).toBe(ConversationState.QUALIFICATION);
  });

  // spec 09, T1.4, AC-33: un lead solo llega a COMMERCIAL_QUALIFICATION
  // después de confirmar interés en una ficha ya mostrada, así que
  // `lastSearchIds` es SIEMPRE no vacío en ese punto. La función no necesita
  // conocer el estado de origen: con `lastSearchIds` no vacío ya vuelve a
  // SEARCH_MATCH (nunca a GREETING/QUALIFICATION-desde-cero), que es
  // coherente para un lead que se liberó en medio de las preguntas
  // comerciales.
  it('AC-33: un lead liberado desde COMMERCIAL_QUALIFICATION (siempre con fichas mostradas) vuelve a SEARCH_MATCH', () => {
    expect(
      resolveReleaseState(lead({ lastSearchIds: ['prop_1', 'prop_2'] })),
    ).toBe(ConversationState.SEARCH_MATCH);
  });
});
