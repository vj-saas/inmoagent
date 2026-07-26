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

- **V-D (portal de gestión de propiedades): CERRADA por completo**
  (2026-07-26). Las 19 tareas de `specs/V-D-portal-propiedades/tasks.md`
  (T1-T19) están implementadas, testeadas y pusheadas a `main`. Los 6
  grupos pasaron `code-reviewer` de forma independiente; se encontraron y
  corrigieron 2 hallazgos reales en el camino (no solo sugerencias):
  un `<form>` anidado en `PhotoListEditor` que disparaba el guardado
  completo de la propiedad al agregar una foto por URL (commit `5af014b`),
  y dos paneles de acción ("Cambiar estado"/"Borrar") que podían quedar
  visibles a la vez sin exclusión mutua (commit `c688c2c`). Estado final de
  la suite: backend unit 49 suites / 428 tests, backend e2e 22 suites / 296
  tests, frontend 64 archivos / 481 tests — todo en verde.

  El backend ahora soporta filtros extendidos de listado
  (`neighborhood`/`minPrice`/`maxPrice`/`rooms`/`q`, T1), bloquea el borrado
  de una propiedad con citas agendadas (409, T2), sincroniza fotos en
  `update` (T3), y expone upload de fotos por archivo
  (`PropertyPhotoStorageService`, T5) aislado por tenant a nivel de
  filesystem (segunda superficie de aislamiento multi-tenant, además de la
  DB), servido como estático desde `useStaticAssets` (T6). El frontend tiene
  una pantalla `/propiedades` completa (`PropertiesPage`, T16) visible para
  `OWNER` y `AGENT` por igual (T17): listado con filtros, alta/edición
  (`PropertyForm`, T13), cambio de estado, borrado con confirmación, editor
  de fotos con upload o URL (`PhotoListEditor`, T12), e import CSV
  reutilizado sin cambios.

  **Requiere acción manual del usuario en Railway**: `railway.toml` declara
  un volumen persistente (`T7`) para las fotos subidas, pero no se pudo
  verificar desde este entorno si el proyecto real de Railway soporta ese
  bloque de config-as-code. Si no lo toma solo en el próximo deploy, hay
  que crear el volumen manualmente (`railway volume add`, mount path
  `/data/uploads`, 5 GB iniciales — pasos documentados en
  `docs/06-DEPLOY.md`) y mantener **una sola réplica** del backend mientras
  se use ese volumen (el disco no se comparte entre réplicas).

  Desvío conocido y aprobado por el usuario en el plan: el rechazo de un
  archivo de foto demasiado grande (>5MB) responde **413**, no el 400 que
  pedía la spec original (limitación de cómo Nest/multer manejan el límite
  del interceptor) — el frontend trata ambos códigos igual.

## Sin arrancar — próxima spec candidata

Con B2 y V-D cerradas, no hay ninguna spec en curso ni follow-up bloqueante
pendiente. Revisar `docs/07-PLAN-VENTA.md` para elegir la próxima fase (D,
E o F, ver abajo) o levantar una spec nueva si el usuario tiene un pedido
puntual.

## Hallazgo resuelto (2026-07-26) — guardrail de mensajes no soportados

- `InboundProcessor.respondUnsupported` respondía automáticamente a mensajes
  no soportados (stickers, etc.) sin chequear si el lead estaba en
  `HUMAN_HANDOFF` u `OPTED_OUT`, violando las reglas #6/#7 del CLAUDE.md.
  **Corregido** (commit `f814223`): ahora no responde si `lead.state` es
  `OPTED_OUT` o `HUMAN_HANDOFF` (incluido handoff vencido >48hs, que no se
  libera por un mensaje sin texto). Tests nuevos en
  `inbound.processor.spec.ts`, `code-reviewer` aprobó sin hallazgos
  críticos.
- Colateral encontrado y corregido en la misma ronda: dos queries en el
  mismo archivo (`respondUnsupported` sobre `lead`, y `handleMessage` sobre
  `message`) usaban `findUnique` filtrando solo por `id`, sin `tenantId` —
  violación de la regla del CLAUDE.md "toda query a DB filtrada por
  tenantId". Riesgo real bajo (`leadId`/`messageId` vienen de jobs internos
  del propio tenant), pero corregidas igual por consistencia y defensa en
  profundidad (`findFirst({ where: { id, tenantId } })`, commits `610443a`
  y `3b0bc24`). Suite completa (backend unit 377 tests, e2e 254 tests) en
  verde después del cambio.

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
3. B2 y V-D cerradas. No hay spec en curso. Antes de arrancar algo nuevo,
   confirmar con el usuario si ya provisionó el volumen de Railway para las
   fotos de propiedades (ver sección de V-D arriba). Correr `npm run test`
   (backend) y `npx vitest run` (frontend) antes de arrancar cualquier
   trabajo nuevo para confirmar que no se rompió nada.
4. Los agentes en background NO sobreviven al cierre de la sesión/chat — no
   asumas que van a seguir corriendo ni que vas a recibir su notificación
   final en el chat nuevo.
