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

`specs/V-B2-bandeja-manual/tasks.md` tiene 20 tareas (T1-T20). **9 de 20
pusheadas a `main`** (todo el Grupo 1, que no tenía dependencias):

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

**Faltan 11 tareas, empezando por el Grupo 2** (`specs/V-B2-bandeja-manual/tasks.md`
tiene el detalle completo de cada una; todas high/crítico salvo T19):

- **T8** — `AdminLeadMessagingService.sendManual` — **NO EXISTE**
  (`src/admin/leads/admin-lead-messaging.service.ts` falta). Es el
  orquestador crítico (lock + transacción + envío) que valida AC-1, AC-2
  [CRÍTICO], AC-3, AC-7 [CRÍTICO], AC-12. Depende de T1/T2/T5/T6, que ya
  están listas — se puede arrancar ya.
- **T10** — mover `release()` del controller al service usando
  `resolveReleaseState` (T3, ya lista) — **NO HECHO**. Verificado en
  `src/admin/leads/admin-leads.controller.ts:103-118`: sigue hardcodeando
  `QUALIFICATION` en vez de usar `resolveReleaseState`. AC-8/AC-9 [CRÍTICO].
- **T11** — `ConversationEngine.resolveGuardrail` debe usar
  `resolveReleaseState` en la rama `handoff_timeout_release` en vez del
  `QUALIFICATION` hardcodeado — **NO HECHO** (verificado en
  `src/conversation/conversation.engine.ts`, no hay referencia a
  `resolveReleaseState`).
- **T19** — badge por lead en `LeadRow.tsx` — **NO HECHO** (verificado, no
  usa `LeadModeBadge` todavía aunque T14 ya está lista).
- Resto de la cadena (T9, T12, T13, T15, T16, T18, T20) sin arrancar —
  dependen de T8/T9 principalmente. Ver "Orden de ejecución sugerido" al
  final de `tasks.md` para el orden correcto de despacho.

Para retomar: despachar `task-router` sobre `specs/V-B2-bandeja-manual/tasks.md`
de nuevo, o despachar Grupo 2 (T8, T10, T11, T19) manualmente vía
`implementer-high`/`implementer-medium` según corresponda.

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
3. Priorizar Grupo 2 de `specs/V-B2-bandeja-manual/tasks.md` (T8, T10, T11,
   T19) — son la superficie crítica que falta para cerrar B2. Correr
   `npm run test` (backend) y `npx vitest run` (frontend) antes de arrancar
   para confirmar que no se rompió nada.
4. Los agentes en background NO sobreviven al cierre de la sesión/chat — no
   asumas que van a seguir corriendo ni que vas a recibir su notificación
   final en el chat nuevo.
