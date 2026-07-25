# Handoff — ejecución de docs/07-PLAN-VENTA.md

Estado al momento de este handoff (revisar `git log` para la foto actual real).

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
  implementadas, testeadas y pusheadas a `origin/main`. Verificación final
  independiente (agente `tester`, sin tocar código): suite completa 929 tests
  en verde (backend unit 300, backend e2e 241, frontend 388), los 16 AC de la
  spec cubiertos por test nombrado explícitamente. Un wizard de 3 pasos
  (`OnboardingWizardPage`) permite dar de alta un tenant, conectar WhatsApp,
  importar propiedades por CSV y configurar mensajes/horarios sin `psql` ni
  Railway CLI; `TenantConfigPage` permite editar esa config después, visible
  solo a `OWNER` (mismo patrón que `PeoplePage`). Master key del wizard vive
  solo en memoria de React, nunca en storage — verificado.
  Nota de coordinación con Fase B dejada en
  `specs/V-C-onboarding-tenant/NOTA-COORDINACION-VB.md` (2 rutas nuevas que
  sumar a la lista de migración al design system: ya están migradas de
  entrada porque se construyeron directamente con los componentes de Fase B).

## Arrancando ahora

- **Fase B2** (bandeja de leads, toma manual): specs/plan/tasks completos y
  aprobados en `specs/V-B2-bandeja-manual/` (20 tareas T1-T20). Se acaba de
  despachar `task-router` sobre esas tasks. Tareas críticas a vigilar de
  cerca: T3, T5, T6, T8, T10, T11, T12, T20 (tocan guardrails de la FSM y un
  lock compartido con el módulo `pipeline`).

## Spec nueva en curso (pedida por el usuario, no estaba en el plan original)

- **Portal de gestión autónoma de propiedades por tenant**: el backend ya
  tiene el CRUD completo (`src/admin/properties/`), pero no existe ninguna
  página de frontend para que la inmobiliaria gestione sus propiedades sin
  depender del import CSV. Clasificado por `triage` como **standard**. Se
  despachó `spec-writer` para producir `specs/V-<nombre-a-confirmar>/spec.md`
  — revisar cuando esté lista, todavía no tiene plan.md ni tasks.md, no
  arrancar implementación hasta aprobar la spec.

## Hallazgo pendiente aparte (no bloquea nada de lo anterior)

- `InboundProcessor.respondUnsupported` responde automáticamente a mensajes
  no soportados (stickers, etc.) sin pasar por los guardrails de
  `HUMAN_HANDOFF`/`OPTED_OUT`. Se disparó como tarea independiente en otra
  sesión (`task_39950477`). Revisar si ya se resolvió.

## No arrancado en absoluto

- **Fase D** (hardening): refresh tokens, monitoreo, backups, rate limiting.
  No tiene sentido antes de tener al menos un tenant real en camino.
- **Fase E** (comercial, no-código): landing, legal, métricas de venta.
  Mayormente requiere al usuario, no a Claude.
- **Fase F** (piloto real): requiere elegir cliente e involucramiento directo
  del usuario.

## Cómo retomar en un chat nuevo

1. Decir algo como: "Retomá la ejecución de docs/07-PLAN-VENTA.md, leé
   HANDOFF-07-PLAN-VENTA.md en la raíz del repo para el estado."
2. Lo primero: `git log --oneline -20` y `git status` para confirmar qué
   quedó commiteado/pusheado realmente (este handoff puede estar
   desactualizado si algo terminó de correr en background después de
   escribirlo).
3. Revisar si la spec del portal de propiedades ya está lista para aprobar
   (`specs/V-*-portal-propiedades/spec.md` o el nombre que haya elegido
   spec-writer) y si Fase B2 avanzó — correr `npm run test` (backend) y
   `npx vitest run` (frontend) para confirmar estado real.
4. Los agentes en background NO sobreviven al cierre de la sesión/chat — no
   asumas que van a seguir corriendo ni que vas a recibir su notificación
   final en el chat nuevo.
