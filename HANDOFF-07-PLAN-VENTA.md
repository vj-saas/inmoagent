# Handoff — ejecución de docs/07-PLAN-VENTA.md

Estado al momento de este handoff (revisar `git log` para la foto actual real).

## Ya pusheado a origin/main (Railway ya lo despliega)

- **Fase A** (cerrar MVP): tests unitarios verdes (267/267), test de aislamiento
  multi-tenant confirmado existente (`test/auth-isolation.e2e-spec.ts`), helmet +
  CSP agregado a `src/main.ts`. **Pendiente sin automatizar**: checklist manual
  de conversación real por WhatsApp contra el sandbox de Meta (`docs/05-OPERACIONES.md`
  §2) — requiere teléfono autorizado del usuario. e2e local no se corrió (requiere
  Docker/Postgres/Redis; se decidió no correrlo contra Railway real para no
  ensuciar datos de producción).

- **Fase B** (design system): completa, T1-T12. Tailwind v4 + shadcn (sin Radix,
  por compatibilidad con tests actuales), tokens en `frontend/src/styles/theme.css`,
  componentes base en `frontend/src/components/ui/`. 337 tests frontend verdes.
  **Pendiente no bloqueante**: verificación visual manual en navegador a 375px
  (documentado en `specs/V-B-design-system/responsive-checklist.md`).

- **Fase C** (onboarding de tenant): **EN CURSO, no terminada**. Specs/plan/tasks
  ya aprobados en `specs/V-C-onboarding-tenant/`. Un agente `task-router` quedó
  corriendo en background ejecutando las 21 tareas de `tasks.md` en la sesión que
  generó este handoff — **si esa sesión se cerró, el agente probablemente se cortó
  a mitad de tarea**. Últimos commits pusheados (ver `git log`):
  `b3913d1 feat: agrega PATCH :tenantId/config y GET :tenantId/webhook-status...`
  y anteriores (migración de `welcomeIntro`/`handoffIntro` + índice en
  `WebhookEvent`, DTO de config, wizard CSS, CORS con `X-Master-Key`, export de
  `OwnerRoleGuard`, soporte FormData en `http-client`).

  **Qué falta revisar/continuar en Fase C** (mirar `specs/V-C-onboarding-tenant/tasks.md`
  para la lista completa T1-T21 y ver cuáles ya tienen código correspondiente):
  - Frontend del wizard (3 pasos: alta, guía Meta + import CSV, configuración) —
    los commits vistos hasta ahora son mayormente backend + CSS del wizard, falta
    confirmar si los componentes React del wizard ya están armados.
  - Test e2e completo (`test/onboarding-wizard.e2e-spec.ts`, AC-13/14/15) y
    `test/admin-tenant-config.e2e-spec.ts` (AC-1 a AC-4, AC-9 a AC-12) — confirmar
    que existen y pasan (requieren Docker/Postgres/Redis local, o revisar si el
    agente los pudo correr).
  - Correr `npm run test` (backend) para confirmar estado real antes de seguir.

## Todavía no arrancado (specs y tasks.md ya listos, pero sin implementar)

- **Fase B2** (bandeja de leads, toma manual): `specs/V-B2-bandeja-manual/` tiene
  spec.md, plan.md y tasks.md completos y aprobados (20 tareas T1-T20). **No se
  despachó su task-router todavía** porque Fase C seguía escribiendo en el mismo
  repo (para evitar que dos orquestadores commiteen en simultáneo y generen
  conflictos). Una vez que Fase C esté realmente terminada y pusheada, el
  siguiente paso es despachar `task-router` con `specs/V-B2-bandeja-manual/tasks.md`.
  Tareas críticas a vigilar de cerca: T3, T5, T6, T8, T10, T11, T12, T20 (tocan
  guardrails de la FSM y un lock compartido con el módulo `pipeline`).

- **Hallazgo pendiente aparte** (no bloquea B2, ya se disparó como tarea
  independiente por el usuario en otra sesión, `task_39950477`): `InboundProcessor.respondUnsupported`
  responde automáticamente a mensajes no soportados (stickers, etc.) sin pasar
  por los guardrails de `HUMAN_HANDOFF`/`OPTED_OUT`. Revisar si esa sesión aparte
  ya lo resolvió.

## No arrancado en absoluto

- **Fase D** (hardening): refresh tokens, monitoreo, backups, rate limiting.
- **Fase E** (comercial, no-código): landing, legal, métricas de venta. Mayormente
  requiere al usuario, no a Claude.
- **Fase F** (piloto real): requiere elegir cliente e involucramiento directo del
  usuario.

## Cómo retomar en un chat nuevo

1. Decir algo como: "Retomá la ejecución de docs/07-PLAN-VENTA.md, leé
   HANDOFF-07-PLAN-VENTA.md en la raíz del repo para el estado."
2. Lo primero que hay que hacer es `git log --oneline -20` y `git status` para
   confirmar qué quedó commiteado/pusheado realmente (este handoff puede estar
   desactualizado si algo terminó de correr en background después de escribirlo).
3. Si Fase C quedó a medio terminar, correr `npm run test` en el backend para
   ver qué está roto, y retomar desde la última tarea de
   `specs/V-C-onboarding-tenant/tasks.md` que no tenga código.
4. Una vez Fase C cerrada y pusheada, arrancar Fase B2 con `task-router` sobre
   `specs/V-B2-bandeja-manual/tasks.md`.
5. Los agentes en background NO sobreviven al cierre de la sesión/chat — no
   asumas que van a seguir corriendo ni que vas a recibir su notificación final
   en el chat nuevo.
