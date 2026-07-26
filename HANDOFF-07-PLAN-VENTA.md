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

- **Fase B2** (bandeja de leads, toma manual): **CERRADA por completo**
  (2026-07-26). Las 20 tareas de `specs/V-B2-bandeja-manual/tasks.md`
  (T1-T20) están implementadas, testeadas y pusheadas a `main`. Cada grupo
  (1 a 6) pasó `code-reviewer` de forma independiente sin hallazgos críticos
  ni de advertencia (solo sugerencias menores no bloqueantes, documentadas
  en los propios reviews). Estado final de la suite: backend unit 45 suites
  / 370 tests, backend e2e 20 suites / 254 tests, frontend 57 archivos / 418
  tests — todo en verde. `AdminLeadMessagingService.sendManual` (T8) permite
  al asesor tomar la conversación con lock+transacción+envío atómico;
  `resolveReleaseState` (T3) unifica el estado de retorno tras un handoff
  tanto en el release manual (T10) como en el timeout de 48hs (T11);
  `LeadDetailPage`/`LeadRow` muestran el modo del lead (IA/manual/opt-out,
  T14/T18/T19) y permiten responder manualmente con `ManualReplyBox` (T16)
  respetando la ventana de servicio de 24hs.

  Hallazgo menor anotado durante T11 (no bloqueante, no resuelto): en el
  camino de guardrail `stop: false`, el `handoffAt: null` del release por
  timeout no se persiste (`persistLeadUpdate` rearma el `data` de cero).
  Hoy es inocuo porque los guardrails deciden por `state`, no por
  `handoffAt`, pero cualquier feature futura que lea `handoffAt` (métricas,
  filtros de bandeja) vería datos sucios en leads liberados por timeout. Si
  se quiere cerrar, es una tarea aparte con su propio test.

## Sin arrancar — próxima spec candidata

Con B2 cerrada, las candidatas para la próxima ronda son:
1. El hallazgo de `InboundProcessor.respondUnsupported` (ver sección
   siguiente) — es chico y quirúrgico, se puede resolver directo sin pasar
   por spec-writer/planner.
2. Aprobar y planear V-D (portal de propiedades, ver abajo).

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
3. B2 ya está cerrada. Elegir entre: resolver el hallazgo de
   `InboundProcessor.respondUnsupported`, o aprobar/planear V-D (portal de
   propiedades). Correr `npm run test` (backend) y `npx vitest run`
   (frontend) antes de arrancar para confirmar que no se rompió nada.
4. Los agentes en background NO sobreviven al cierre de la sesión/chat — no
   asumas que van a seguir corriendo ni que vas a recibir su notificación
   final en el chat nuevo.
