# Tasks B.1: Completar `appointments` en el backend

> Producido por `task-splitter`. Tareas atómicas derivadas de `plan.md`, cada
> una despachable a un implementer. Vive en
> `specs/B1-appointments-backend/tasks.md`.
>
> Nota de clasificación (replica el criterio de A.4, ver CLAUDE.md
> "Qué es low/medium/high" y su nota final): la migración Prisma es **high**
> por definición explícita del CLAUDE.md ("migraciones Prisma / cambios de
> schema"), no crítica. Los endpoints nuevos siguen el patrón
> `findFirst({id, tenantId}) → 404` ya vigente en `AdminLeadsService` y no
> introducen resolución de tenant nueva, por lo que quedan en **medium**
> (CRUD/DTOs de `admin`/`appointments`, según CLAUDE.md). La máquina de
> transiciones central (`assertTransition`) se mantiene en **medium**, no
> **high**: a diferencia del opt-out transaccional de A.4 (que sí corría en
> `$transaction` por la carrera con el bot escribiendo `status` en paralelo),
> acá el plan establece explícitamente que no hay un segundo escritor
> concurrente sobre `status` — el bot solo crea vía `propose()` y nunca
> transiciona — por lo que no hay el mismo caso de carrera real que ameritó
> `high` en A.4. El e2e de regresión multi-tenant que recorre los 6 endpoints
> (GET + 5 POST) sí queda en **high**, replicando el mismo criterio de A.4:
> "ante la duda, el nivel más alto para la superficie crítica de aislamiento"
> — el aislamiento multi-tenant es crítico según CLAUDE.md aunque la
> dificultad de la migración/CRUD individual no lo sea.

## Tareas

## T1 — Migración Prisma: `NO_SHOW`, `assignedUserId`, `outcome`, índice
- **Dificultad:** high  ← migración de schema Prisma, clasificación explícita del CLAUDE.md, no crítica
- **Descripción:** Agregar `NO_SHOW` al enum `AppointmentStatus` (al final,
  aditivo). Agregar a `Appointment`: `assignedUserId String?` +
  `assignedUser Person? @relation("AppointmentAssignee", onDelete: SetNull)`,
  `outcome String?`. Agregar relación inversa `Person.assignedAppointments
  Appointment[] @relation("AppointmentAssignee")`. Agregar
  `@@index([tenantId, scheduledAt])`. Generar y correr la migración
  (`npx prisma migrate dev`), verificar que Prisma Client regenerado tipa
  correctamente los campos nuevos. Sin backfill, todo nullable/aditivo.
- **Valida:** prerrequisito estructural de AC-1, AC-4, AC-5, AC-6, AC-11,
  AC-13, AC-21 (ningún AC de negocio se valida directamente en esta tarea;
  se verifica por build limpio + `npx prisma validate` + que
  `test/admin-appointments.e2e-spec.ts` de tareas posteriores compile contra
  el schema nuevo). Si se prefiere cobertura explícita, agregar un test
  mínimo de migración (`prisma migrate diff` sin pendientes) — hueco a
  cerrar si el implementer lo considera necesario.
- **Dependencias:** ninguna
- **Paralelizable:** no (bloquea todas las tareas siguientes)

## T2 — `AppointmentsAdminService`: `findAppointmentOrThrow` + `assertTransition`
- **Dificultad:** medium  ← lógica de negocio estándar sobre `appointments`/`admin`, no introduce resolución de tenant nueva (replica `AdminLeadsService`); ver nota de clasificación arriba sobre por qué no es `high` a pesar de ser central
- **Descripción:** Crear `src/admin/appointments/appointments-admin.service.ts`
  con `findAppointmentOrThrow(tenantId, aid, tx?)` (espejo de
  `findLeadOrThrow`, `findFirst({id, tenantId}) → NotFoundException('Cita no
  encontrada')`) y el helper privado `assertTransition(current, action)` que
  valida contra la tabla `{ confirm: {PROPOSED}, reschedule: {CONFIRMED},
  cancel: {PROPOSED, CONFIRMED}, done: {CONFIRMED}, noShow: {CONFIRMED} }` y
  lanza `ConflictException` (409) si el estado actual no está en el set
  correspondiente. No implementa aún los métodos de transición completos
  (eso es T4-T7); esta tarea deja el esqueleto del service + el helper +
  unit test que recorre la matriz completa.
- **Valida:** AC-15 vía unit test de `assertTransition` (matriz completa,
  los tres terminales bloqueados para las cinco acciones) y vía
  `test/admin-appointments.e2e-spec.ts::terminal states` una vez integrado
  en T4-T7.
- **Dependencias:** T1
- **Paralelizable:** sí (con T3)

## T3 — DTOs de los 5 endpoints de transición + del GET
- **Dificultad:** medium  ← DTOs con `class-validator`, patrón estándar del CLAUDE.md
- **Descripción:** Crear en `src/admin/appointments/dto/`:
  `confirm-appointment.dto.ts` (`scheduledAt` requerido `@IsDateString()`,
  `assignedUserId?` `@IsOptional() @IsString()`, `notes?` `@IsOptional()
  @IsString() @MaxLength(2000)`), `reschedule-appointment.dto.ts`
  (`scheduledAt` requerido, `notes?`, sin `outcome`/`assignedUserId` —
  whitelist rechaza props extra), `cancel-appointment.dto.ts` (`notes?`
  únicamente), `close-appointment.dto.ts` compartido por `done`/`no-show`
  (`outcome?`, `notes?`), `list-appointments-query.dto.ts` (`status?:
  AppointmentStatus[]` con `@Transform` a array + `@IsEnum(..., {each:
  true})`, `from?`/`to?` `@IsOptional() @IsDateString()`).
- **Valida:** AC-2 (400 sin `scheduledAt` en confirm) y AC-8 (400 sin
  `scheduledAt` en reschedule) vía `test/admin-appointments.e2e-spec.ts`
  (una vez wireados los endpoints en T4/T5); validación aislada de cada DTO
  también cubribles con unit test de `class-validator`.
- **Dependencias:** T1
- **Paralelizable:** sí (con T2)

## T4 — `confirm()`: transición PROPOSED → CONFIRMED + `assignedUserId`
- **Dificultad:** medium
- **Descripción:** Implementar `AppointmentsAdminService.confirm(tenantId,
  aid, dto)`: `findAppointmentOrThrow` → `assertTransition('confirm')` (409
  si no `PROPOSED`) → si `dto.assignedUserId` viene, `person.findFirst({id,
  tenantId})`; null → 400 → `updateMany({where: {id, tenantId, status:
  PROPOSED}, data: {status: CONFIRMED, scheduledAt, assignedUserId?,
  notes?}})` condicional (evita TOCTOU sin `$transaction`, ver plan) →
  releer y devolver la cita actualizada.
- **Valida:** AC-1, AC-3, AC-4, AC-5 vía
  `test/admin-appointments.e2e-spec.ts::confirm`.
- **Dependencias:** T2, T3
- **Paralelizable:** no (mismo archivo de service que T5/T6/T7, evitar conflictos de merge; conceptualmente independiente)

## T5 — `reschedule()`: actualizar `scheduledAt` sobre CONFIRMED sin cambiar status
- **Dificultad:** medium
- **Descripción:** Implementar `reschedule(tenantId, aid, dto)`:
  `findAppointmentOrThrow` → `assertTransition('reschedule')` (409 si no
  `CONFIRMED`) → `updateMany` condicional `{where: {id, tenantId, status:
  CONFIRMED}, data: {scheduledAt, notes?}}` sin tocar `status` → releer y
  devolver.
- **Valida:** AC-6, AC-7 vía `test/admin-appointments.e2e-spec.ts::reschedule`.
- **Dependencias:** T2, T3
- **Paralelizable:** no (mismo archivo que T4/T6/T7)

## T6 — `cancel()`: transición PROPOSED|CONFIRMED → CANCELLED
- **Dificultad:** medium
- **Descripción:** Implementar `cancel(tenantId, aid, dto)`:
  `findAppointmentOrThrow` → `assertTransition('cancel')` (409 desde
  terminal) → `updateMany` condicional `{where: {id, tenantId, status: {in:
  [PROPOSED, CONFIRMED]}}, data: {status: CANCELLED, notes?}}` → releer y
  devolver.
- **Valida:** AC-9, AC-10 vía `test/admin-appointments.e2e-spec.ts::cancel`.
- **Dependencias:** T2, T3
- **Paralelizable:** no (mismo archivo que T4/T5/T7)

## T7 — `done()` y `noShow()`: cierre de visita CONFIRMED → DONE/NO_SHOW
- **Dificultad:** medium
- **Descripción:** Implementar `done(tenantId, aid, dto)` y
  `noShow(tenantId, aid, dto)` compartiendo `CloseAppointmentDto`:
  `findAppointmentOrThrow` → `assertTransition('done'|'noShow')` (409 si no
  `CONFIRMED`) → `updateMany` condicional a `status: DONE`/`NO_SHOW` con
  `{outcome?, notes?}` → releer y devolver.
- **Valida:** AC-11, AC-12, AC-13, AC-14 vía
  `test/admin-appointments.e2e-spec.ts::done` y `::no-show`.
- **Dependencias:** T2, T3
- **Paralelizable:** no (mismo archivo que T4/T5/T6)

## T8 — `list()` + filtros de fecha/status del GET
- **Dificultad:** medium
- **Descripción:** Implementar `AppointmentsAdminService.list(tenantId,
  query)`: `where: {tenantId}`, + `status` si vino (`{in: [...]}`), + rango
  de fecha SOLO sobre `scheduledAt` si `from`/`to` vinieron
  (`where.scheduledAt = {gte: from, lte: to}`, Prisma excluye nulls
  automáticamente — las `PROPOSED` sin `scheduledAt` quedan fuera del rango
  por diseño, no se usa `createdAt` como fallback). `orderBy: {scheduledAt:
  {sort: 'asc', nulls: 'last'}}`. Sin paginación. Devuelve `{appointments:
  [...]}`.
- **Valida:** AC-16, AC-17, AC-18 vía `test/admin-appointments.e2e-spec.ts::GET`.
- **Dependencias:** T2, T3
- **Paralelizable:** sí (con T4-T7, archivo distinto de método pero mismo service — coordinar si el implementer es el mismo que T4-T7)

## T9 — `AppointmentsAdminController` + registro en `AdminModule`
- **Dificultad:** medium  ← controller nuevo bajo módulo admin existente, mismos guards que `leads`, sin resolución de tenant nueva
- **Descripción:** Crear `src/admin/appointments/appointments-admin.controller.ts`
  con `GET :tenantId/appointments` y los 5 `POST :tenantId/appointments/:aid/
  {confirm,reschedule,cancel,done,no-show}`, protegidos por
  `TenantThrottlerGuard` + `PersonOrApiKeyGuard` (idéntico a
  `AdminLeadsController`), `@HttpCode(200)` en los POST. Registrar
  `AppointmentsAdminController` en `controllers` y `AppointmentsAdminService`
  en `providers` de `AdminModule` existente (no se crea módulo nuevo).
- **Valida:** cablea AC-1 a AC-18 (expone los métodos de T4-T8 vía HTTP);
  validación end-to-end completa en
  `test/admin-appointments.e2e-spec.ts` (todos los casos felices y de error
  de status code).
- **Dependencias:** T4, T5, T6, T7, T8
- **Paralelizable:** no (integra todo lo anterior)

## T10 — e2e de regresión multi-tenant: aislamiento en los 6 endpoints
- **Dificultad:** high  ← superficie crítica de aislamiento multi-tenant (CLAUDE.md), mismo criterio que A.4: ante la duda, el nivel más alto para esta superficie
- **Descripción:** En `test/admin-appointments.e2e-spec.ts`, agregar la
  matriz de regresión cross-tenant sobre los 6 endpoints (`GET` + 5 `POST`):
  para cada uno, (a) `aid` que no existe → 404 con mensaje unificado 'Cita
  no encontrada'; (b) `aid` de una cita de otro tenant, invocado con el
  `tenantId` correcto en la URL pero apuntando a un recurso ajeno → 404 (no
  oráculo de existencia); (c) sesión de tenant A contra `:tenantId` de
  tenant B → 403 sin exponer ni modificar datos de B. Incluye el caso de
  `assignedUserId` de otro tenant en `confirm` → 400 indistinguible de
  inexistente (AC-5, reforzado acá como caso de aislamiento).
- **Valida:** AC-19, AC-20 vía `test/admin-appointments.e2e-spec.ts::cross-tenant isolation`.
- **Dependencias:** T9
- **Paralelizable:** sí (con T11)

## T11 — Verificación de métricas y regresión de `propose()`
- **Dificultad:** medium  ← test de verificación sin cambios de código en `MetricsService` (según spec/plan), lógica estándar de `admin`/métricas
- **Descripción:** Agregar test que confirma una cita (`POST :aid/confirm`)
  dentro de un rango de fechas dado y verifica que
  `MetricsService.appointments.confirmed` para ese mismo rango la refleje
  (sin tocar código de `MetricsService`, ya es correcto). Agregar test de
  regresión que confirma que `AppointmentsService.propose()` sigue creando
  citas en `PROPOSED` sin `scheduledAt`, sin cambios de esta spec.
- **Valida:** AC-21, AC-22 vía `test/admin-appointments.e2e-spec.ts::metrics
  regression` y `test/appointments.e2e-spec.ts` (o el spec existente de
  `propose()`, sin modificar su código de producción).
- **Dependencias:** T4
- **Paralelizable:** sí (con T10)

## Orden de ejecución sugerido

> Lo usa `task-router` para despachar.

- **Grupo 1 (secuencial, bloquea todo):** T1
- **Grupo 2 (paralelo, depende de Grupo 1):** T2, T3
- **Grupo 3 (paralelo, depende de Grupo 2):** T4, T5, T6, T7, T8
  (nota: comparten archivo de service; si el `task-router` asigna
  implementers distintos, coordinar merge o serializar en la práctica aunque
  la dependencia lógica sea paralela)
- **Grupo 4 (secuencia, depende de Grupo 3):** T9
- **Grupo 5 (paralelo, depende de Grupo 4):** T10, T11

## Cobertura de criterios

- AC-1 → T4 ✓
- AC-2 → T3, T4 ✓
- AC-3 → T4 ✓
- AC-4 → T4 ✓
- AC-5 → T4, T10 ✓
- AC-6 → T5 ✓
- AC-7 → T5 ✓
- AC-8 → T3, T5 ✓
- AC-9 → T6 ✓
- AC-10 → T6 ✓
- AC-11 → T7 ✓
- AC-12 → T7 ✓
- AC-13 → T7 ✓
- AC-14 → T7 ✓
- AC-15 → T2 ✓
- AC-16 → T8 ✓
- AC-17 → T8 ✓
- AC-18 → T8 ✓
- AC-19 → T10 ✓
- AC-20 → T10 ✓
- AC-21 → T11 ✓
- AC-22 → T11 ✓

Sin huecos: los 22 AC de la spec tienen al menos una tarea que los valida.
Único punto abierto (no bloqueante, señalado en T1): la migración Prisma en
sí no tiene un test de aceptación propio, solo se verifica por build/typecheck
y por que las tareas posteriores compilen y pasen contra el schema nuevo.
