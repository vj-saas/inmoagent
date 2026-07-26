# Handoff — ejecución de docs/07-PLAN-VENTA.md

Estado al momento de este handoff (2026-07-26). Revisar `git log` para la foto
actual real — esto puede haber avanzado si algo siguió corriendo en background.

## Ya pusheado a origin/main (Railway ya lo despliega)

- **Fase A** (cerrar MVP): tests unitarios verdes, test de aislamiento
  multi-tenant confirmado existente (`test/auth-isolation.e2e-spec.ts`), helmet +
  CSP en `src/main.ts`. **Pendiente sin automatizar**: checklist manual de
  conversación real por WhatsApp contra el sandbox de Meta (`docs/05-OPERACIONES.md`
  §2) — requiere teléfono autorizado del usuario.

- **Fase B** (design system): completa, T1-T12. Tailwind v4 + shadcn, tokens en
  `frontend/src/styles/theme.css`, componentes base en `frontend/src/components/ui/`.

- **Fase C** (onboarding de tenant): **CERRADA por completo** (2026-07-25).
  Las 21 tareas de `specs/V-C-onboarding-tenant/tasks.md` (T1-T21) están
  implementadas, testeadas y pusheadas. Wizard de 3 pasos
  (`OnboardingWizardPage`) + `TenantConfigPage` para editar después (solo
  `OWNER`). Nota de coordinación en `specs/V-C-onboarding-tenant/NOTA-COORDINACION-VB.md`.

## En progreso ahora mismo — Fase B2 (bandeja de leads, toma manual)

`specs/V-B2-bandeja-manual/tasks.md` tiene 20 tareas (T1-T20). **13 de 20
pusheadas a `main`** (Grupo 1 completo + Grupo 2 completo):

| Tarea | Qué es | Commit |
|---|---|---|
| T1 | Migración Prisma `Message.sentByPersonId` | `a4e2dd4` |
| T2 | `service-window.util.ts` (ventana 24hs) | `734da61` |
| T3 | `release-state.util.ts` (`resolveReleaseState`) | `7e0b028` |
| T4 | `PersonSessionRequiredGuard` | `5f069f1` |
| T5 | `DebounceBufferService.withLeadLock` | `9f020bf` |
| T6 | `messageId` opcional en job de texto (`messaging`) | `58dae06` |
| T7 | `SendManualMessageDto` | `7b4919b` |
| T14 | `LeadModeBadge` + `resolveLeadMode` | `1ad9074` |
| T17 | `ReleaseHandoffButton` con modal de confirmación | `adaf3b4` |
| T19 | Badge por lead en `LeadRow.tsx` | `4058805` |
| T10 | `release()` movido a `AdminLeadsService` con `resolveReleaseState` | `31bba35` |
| T11 | `resolveGuardrail` usa `resolveReleaseState` en el timeout de 48hs | `8999cf5` |
| T8 | `AdminLeadMessagingService.sendManual` (lock + tx + envío) | `f8b2bc2` |

Grupo 2 pasó `code-reviewer` sin hallazgos críticos ni de advertencia
(veredicto: aprobado; dos sugerencias menores no bloqueantes sobre
documentación de invariantes, no requieren cambio). Suite completa en verde:
backend 45 suites / 353 tests, frontend 56 archivos / 404 tests.

**Faltan 7 tareas — Grupo 3 en adelante** (todas dependen de T8/T9):

- **T9** — `POST :leadId/send`: controller + wiring de `AdminModule` +
  exponer `lastInboundAt`/`sentByPerson` en `getOne`/`messages`. Depende de
  T4, T7, T8 (las tres ya están listas) — **siguiente a despachar**.
- **T12** — extender tests de `GuardrailsService`/`conversation.engine.spec.ts`
  sobre `HUMAN_HANDOFF` originado por `send` (sin cambios de código). Depende
  de T8 (listo) y T11 (listo).
- **T13** — `frontend/src/api/endpoints.ts`: tipos + `sendManualMessage`.
  Depende de T9.
- **T15, T16** — `MessageTimeline.tsx` (tres tonos) y `ManualReplyBox.tsx`
  (caja de envío). Dependen de T13 (T16 además de T14, ya lista).
- **T18** — wiring de badge/header/`ManualReplyBox` en `LeadDetailPage.tsx`.
  Integra T14, T15, T16, T17 (T14 y T17 ya listas).
- **T20** — e2e completo `test/admin-lead-manual-reply.e2e-spec.ts`. Depende
  de T9, T10, T12.

Ver "Orden de ejecución sugerido" al final de `tasks.md` para el detalle:
Grupo 3 (T9, T12) → Grupo 4 (T13, T20) → Grupo 5 (T15, T16) → Grupo 6 (T18).

Para retomar: despachar `task-router` sobre el resto de `tasks.md`, o
despachar T9 primero (bloquea casi todo lo demás) manualmente vía
`implementer-medium`.

## Spec en espera de aprobación — Portal de gestión de propiedades (V-D)

- `specs/V-D-portal-propiedades/spec.md` está escrita (302 líneas, incluye ya
  la decisión de upload de fotos por archivo, commit `501a689`). **Todavía no
  tiene `plan.md` ni `tasks.md` — no arrancar implementación sin aprobar la
  spec primero** (despachar `planner` cuando el usuario confirme el alcance).
- Backend CRUD ya existe (`src/admin/properties/`); falta solo el frontend.

## Hallazgo pendiente, sin resolver — guardrail de mensajes no soportados

- `InboundProcessor.respondUnsupported` (`src/pipeline/inbound.processor.ts:78-98`)
  sigue respondiendo automáticamente a mensajes no soportados (stickers, etc.)
  sin chequear si el lead está en `HUMAN_HANDOFF` u `OPTED_OUT` — verificado
  en este handoff, el código no tiene ningún check de `lead.state` antes de
  `messaging.sendText`. Confirmado explícitamente **fuera de alcance** de
  Fase B2 (nota en `specs/V-B2-bandeja-manual/tasks.md` líneas 4-6 y 414-418):
  es candidato a spec/tarea de follow-up separada. No bloquea nada del resto
  del plan pero es un guardrail real roto — priorizar cuando se cierre B2.

## Sin tocar, no relevante para retomar

- Hay un worktree viejo en `.claude/worktrees/keen-babbage-e10987` (HEAD
  detached en `f92902c`, sin diff contra `main` — ya está todo mergeado).
  Working tree limpio ahí, no requiere acción; se puede borrar con
  `git worktree remove` si se quiere prolijidad, pero no es urgente.

## No arrancado en absoluto

- **Fase D** (hardening): refresh tokens, monitoreo, backups, rate limiting.
  No tiene sentido antes de tener al menos un tenant real en camino.
- **Fase E** (comercial, no-código): landing, legal, métricas de venta.
  Mayormente requiere al usuario, no a Claude.
- **Fase F** (piloto real): requiere elegir cliente e involucramiento directo
  del usuario.

## Cómo retomar en un chat nuevo

1. Decir algo como: "Retomá la ejecución de docs/07-PLAN-VENTA.md, leé
   HANDOFF-07-PLAN-VENTA.md en la raíz del repo `agente-inmo` para el estado."
2. Lo primero: `git log --oneline -20` y `git status` en `agente-inmo/` para
   confirmar qué quedó commiteado/pusheado realmente (este handoff puede
   estar desactualizado si algo terminó de correr en background después de
   escribirlo).
3. Priorizar Grupo 3 de `specs/V-B2-bandeja-manual/tasks.md` (T9, empieza
   ahí — bloquea T13/T15/T16/T18/T20) y T12. Correr `npm run test` (backend)
   y `npx vitest run` (frontend) antes de arrancar para confirmar que no se
   rompió nada.
4. Los agentes en background NO sobreviven al cierre de la sesión/chat — no
   asumas que van a seguir corriendo ni que vas a recibir su notificación
   final en el chat nuevo.
