import { ConversationState, type Lead } from '@prisma/client';

/**
 * Resuelve a qué estado de la FSM vuelve un lead que sale de `HUMAN_HANDOFF`,
 * sea por el botón "Devolver al agente IA" (`POST :leadId/release`) o por el
 * timeout de 48hs (`handoff_timeout_release` del `ConversationEngine`). Ambos
 * caminos comparten esta función para que "salir de handoff" signifique
 * exactamente lo mismo en los dos (spec V-B2, decisión 5; AC-8 / AC-9).
 *
 * Función PURA: sin I/O, sin DB, sin `await`, sin dependencias de Nest. La FSM
 * —no el LLM— decide el estado de retorno (principio rector del proyecto).
 *
 * Regla, deliberadamente binaria:
 * - `lastSearchIds` no vacío (ya se le mostraron fichas concretas) →
 *   `SEARCH_MATCH`.
 * - en cualquier otro caso → `QUALIFICATION`.
 *
 * Por qué NO hay una rama para `fOperation`: el paso 2 de la decisión 5 de la
 * spec ("si `fOperation` está seteado → `QUALIFICATION`") y el paso 3 ("sin
 * `fOperation` ni `lastSearchIds` → `QUALIFICATION` igual") colapsan en el
 * mismo resultado, y AC-9 lo confirma explícitamente ("sin importar si
 * `fOperation` está seteado o no"). Un `if (lead.fOperation)` que devuelve
 * `QUALIFICATION` en las dos ramas sería código muerto que sugiere una
 * diferencia de comportamiento inexistente, así que `fOperation` directamente
 * no participa del cálculo (ni figura en la firma).
 *
 * Por qué `QUALIFICATION` es el default seguro: sus handlers toleran filtros
 * vacíos (arrancan preguntando lo que falte), así que un handoff tomado muy
 * temprano vuelve a un estado consistente sin datos previos.
 *
 * Por qué NUNCA devuelve `GREETING`: el saludo con el aviso de tratamiento de
 * datos (Ley 25.326) se manda una sola vez y queda marcado por `greetedAt`;
 * volver a `GREETING` lo repetiría.
 *
 * Por qué NUNCA devuelve `HUMAN_HANDOFF` ni `OPTED_OUT`: liberar un lead a
 * `HUMAN_HANDOFF` sería un no-op que dejaría al bot silenciado para siempre, y
 * `OPTED_OUT` es una baja del lead que ningún release puede provocar (el
 * opt-out es siempre decisión del lead, regla de negocio innegociable #6).
 * Quien llama debe garantizar además que el lead esté en `HUMAN_HANDOFF`; esta
 * función no valida el estado de origen (el endpoint lo hace de forma atómica).
 */
export function resolveReleaseState(
  lead: Pick<Lead, 'lastSearchIds'>,
): ConversationState {
  // `Array.isArray` además del `length`: el tipo garantiza `string[]`, pero un
  // lead traído con un `select` parcial o por SQL crudo podría llegar sin el
  // campo, y ahí el default seguro tiene que ser `QUALIFICATION`, no un throw.
  const hasShownProperties =
    Array.isArray(lead.lastSearchIds) && lead.lastSearchIds.length > 0;

  return hasShownProperties
    ? ConversationState.SEARCH_MATCH
    : ConversationState.QUALIFICATION;
}
