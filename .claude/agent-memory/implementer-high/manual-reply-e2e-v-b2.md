---
name: manual-reply-e2e-v-b2
description: Cómo se ejercitan los AC críticos de V-B2 en test/admin-lead-manual-reply.e2e-spec.ts (turnos por engine.handleTurn, encolado vía mock de MessagingService, release devuelve 200)
metadata:
  type: project
---

`test/admin-lead-manual-reply.e2e-spec.ts` (T20 de `specs/V-B2-bandeja-manual`)
es la única superficie que cubre punta a punta AC-2/AC-6/AC-8/AC-9.

**Decisiones de montaje (repetir si se extiende):**
- Los turnos entrantes se disparan con `ConversationEngine.handleTurn` (patrón de
  `conversation-engine.e2e-spec.ts`), NO con un POST al webhook: el webhook solo
  encola y el AC afirma el efecto del turno ya desbufferizado. Evita depender del
  debounce de 6s y del worker. Ver [[composite-guard-e2e]].
- `MessagingService` va mockeado (nada le pega a Meta), así que "job encolado en
  `outbound` con el `messageId`" se assertea sobre los argumentos de `sendText`:
  su única responsabilidad real es `outboundQueue.add` con ese payload.
- `ConversationEngine.handleTurn` NO persiste `Message` (solo lee): los contadores
  de OUT del spec no se ensucian al invocarlo.
- `POST :leadId/release` devuelve **200** (`@HttpCode(200)`), `POST :leadId/send`
  devuelve **201**. Fácil de confundir en el mismo spec.
- `beforeEach` con `jest.clearAllMocks()` (conserva `mockResolvedValue`), nunca
  `resetAllMocks`.

**Why:** los AC críticos hablan de ausencia de side effects (0 Messages, 0
encolados, bot mudo); sin estas piezas el test verifica el status code y poco más.

**How to apply:** verificado por mutación (ver
[[mutation-check-critical-branches]]): quitando el chequeo de opt-out + el
`state: { not: OPTED_OUT }` del `updateMany`, cambiando `HUMAN_HANDOFF` por
`QUALIFICATION` en `sendManual` y hardcodeando `QUALIFICATION` en
`AdminLeadsService.release`, fallan exactamente AC-1, AC-2, AC-6, AC-8 y AC-10.
AC-9 sigue verde ante el hardcodeo de `QUALIFICATION` por construcción: el caso
discriminante de `resolveReleaseState` es AC-8, no AC-9.
