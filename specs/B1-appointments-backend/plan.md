# Plan B.1: Completar `appointments` en el backend

> Producido por planner. Define CÓMO se construye lo que la spec (B.1) pide.
> Fase con migración Prisma (high, no crítica según CLAUDE.md). El aislamiento
> multi-tenant SÍ es crítico y se preserva sin introducir ninguna query
> cross-tenant nueva, replicando el patrón findFirst({ id, tenantId }) -> 404
> ya vigente en AdminLeadsService.findLeadOrThrow.

## Arquitectura

Dos frentes acoplados por el contrato HTTP de
`/admin/tenants/:tenantId/appointments`:

- **DB / Prisma (high):** una migración aditiva. Un valor nuevo en el enum
  `AppointmentStatus` (`NO_SHOW`) y dos columnas nullable en `Appointment`
  (`assignedUserId` FK a `Person` con `SetNull`, `outcome String?`). Más la
  relación inversa `Person -> Appointment[]`. Todo aditivo y nullable: no
  reescribe datos, no toca `propose()`, no rompe el bot ni las métricas.
  `scheduledAt` y `notes` ya existen; solo empiezan a usarse de verdad.

- **Backend (medium salvo el aislamiento, crítico y ya vigente):** se introduce
  un `AppointmentsAdminService` (espejo arquitectónico de `AdminLeadsService`)
  que concentra el helper `findAppointmentOrThrow(tenantId, aid)` y la máquina
  de transiciones. Un `AppointmentsAdminController` nuevo cuelga de
  `admin/tenants/:tenantId/appointments`, protegido por exactamente los mismos
  guards que `AdminLeadsController` (`TenantThrottlerGuard + PersonOrApiKeyGuard`),
  con el mismo patrón findFirst({ id, tenantId }) -> 404 unificado. Ambos se
  registran en el `AdminModule` existente (no se crea módulo nuevo).

- **Métricas:** sin cambios de código. La query de `appointments.confirmed`
  (`status = CONFIRMED`, `updatedAt` en rango) ya es correcta; lo único que
  faltaba era que existiera un camino `PROPOSED -> CONFIRMED`. `confirm()` lo
  provee y `@updatedAt` se refresca solo en el update. Se agrega un test de
  verificación, no código de producción.

Flujo de una transición: el controller recibe el POST -> delega en
`AppointmentsAdminService.<transicion>(tenantId, aid, dto)` ->
`findAppointmentOrThrow` (404) -> validación central de la matriz
(`assertTransition`, 409) -> validación de `assignedUserId` cuando aplica (400)
-> `update` -> devuelve el `Appointment` actualizado.

## Entidades / módulos afectados

### DB (prisma/schema.prisma) -- migración
- **enum AppointmentStatus (modifica):** +`NO_SHOW`.
- **model Appointment (modifica):** +`assignedUserId String?`, +`assignedUser
  Person? @relation(..., onDelete: SetNull)`, +`outcome String?`, +opcional
  `@@index([tenantId, scheduledAt])`.
- **model Person (modifica):** +relación inversa `assignedAppointments Appointment[]`.

### Backend
- `src/admin/appointments/appointments-admin.service.ts` (**nuevo**):
  `findAppointmentOrThrow`, `list`, `confirm`, `reschedule`, `cancel`, `done`,
  `noShow`, helper privado `assertTransition`.
- `src/admin/appointments/appointments-admin.controller.ts` (**nuevo**): 1 GET +
  5 POST bajo `admin/tenants/:tenantId/appointments`.
- `src/admin/appointments/dto/list-appointments-query.dto.ts` (**nuevo**).
- `src/admin/appointments/dto/confirm-appointment.dto.ts` (**nuevo**).
- `src/admin/appointments/dto/reschedule-appointment.dto.ts` (**nuevo**).
- `src/admin/appointments/dto/cancel-appointment.dto.ts` (**nuevo**).
- `src/admin/appointments/dto/close-appointment.dto.ts` (**nuevo**, compartido
  por `done` y `no-show`).
- `src/admin/admin.module.ts` (**modifica**): registra controller y service nuevos.
- `test/admin-appointments.e2e-spec.ts` (**nuevo**): matriz, aislamiento
  cross-tenant, filtros del GET, verificación métrica (AC-21).

### Sin cambios (explícito)
- `src/appointments/appointments.service.ts` (`propose()`) -- intacto (AC-22).
- `src/admin/metrics/metrics.service.ts` -- intacto (AC-21, solo test).
- `SchedulingHandler` -- intacto.

## Migración Prisma (diff conceptual del schema)

```prisma
enum AppointmentStatus {
  PROPOSED
  CONFIRMED
  DONE
  CANCELLED
  NO_SHOW      // NUEVO (B.1): lead no se presentó a una cita CONFIRMED
}

model Appointment {
  id             String            @id @default(cuid())
  tenantId       String
  tenant         Tenant            @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  leadId         String
  lead           Lead              @relation(fields: [leadId], references: [id], onDelete: Cascade)
  propertyId     String?
  status         AppointmentStatus @default(PROPOSED)
  scheduledAt    DateTime?
  notes          String?
  assignedUserId String?                                              // NUEVO
  assignedUser   Person?  @relation("AppointmentAssignee", fields: [assignedUserId], references: [id], onDelete: SetNull) // NUEVO
  outcome        String?                                              // NUEVO

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([tenantId, status])
  @@index([tenantId, scheduledAt])   // NUEVO (ver decisión de índice)
}

model Person {
  // ... campos existentes ...
  assignedAppointments Appointment[] @relation("AppointmentAssignee")   // NUEVO
}
```

Decisiones de la migración:

- **`NO_SHOW` como valor de enum.** En Postgres `ALTER TYPE ... ADD VALUE` es
  aditivo y no reescribe filas; ninguna cita existente cambia. Va al final del
  enum para no alterar el orden de los valores previos.
- **`assignedUserId String?` + `onDelete: SetNull`, relación `"AppointmentAssignee"`.**
  Mismo patrón exacto que `Lead.assignedUserId` (`"LeadAssignee"`). Nullable: una
  cita puede no tener asesor (se crea así en `propose()` y puede confirmarse sin
  asignar). `SetNull` para que un hard-delete futuro de la `Person` no borre ni
  bloquee la cita: queda sin asignar. NUNCA `Cascade`. Nombre de relación
  explícito para desambiguar en `Person`. No se autocompleta desde
  `Lead.assignedUserId` (decisión 4 de la spec).
- **`outcome String?`.** Texto libre corto, sin catálogo ni default. Aditivo puro.
- **Índice `@@index([tenantId, scheduledAt])` (recomendado, no bloqueante).** El
  GET filtra por rango sobre `scheduledAt` dentro de un `tenantId`; el índice
  `[tenantId, status]` existente no cubre ese rango. Costo marginal y la agenda
  es lectura frecuente (B.2/B.3). Alternativa descartada: no indexar y confiar en
  `[tenantId, status]` -- solo sirve si además se filtra por status.
- Sin backfill. Clasificación: **high** por cambio de schema, NO crítico.

## Decisiones técnicas

### Service y máquina de transiciones

- **`AppointmentsAdminService` con `findAppointmentOrThrow` (espejo de
  `AdminLeadsService`).** Se replica el patrón aprobado en A.4: `Injectable` que
  centraliza `findFirst({ id, tenantId }) -> NotFound('Cita no encontrada')`,
  barrera anti-oráculo de existencia cross-tenant, usado en las 5 transiciones.
  Firma: `findAppointmentOrThrow(tenantId, aid, tx?)`, `tx` opcional por
  consistencia con el helper de leads.

- **Matriz validada por una función central (`assertTransition`), NO inline por
  método. JUSTIFICACIÓN:** la matriz es una tabla cerrada y las reglas
  terminales (`DONE`/`CANCELLED`/`NO_SHOW` no salen a nada) son transversales a
  los cinco endpoints (AC-15). Una función `assertTransition(current, action)`
  que consulta `Record<action, Set<estados-origen-válidos>>` y lanza
  `ConflictException` (409) si el estado actual no está en el set:
  - Bloquea los tres terminales para las cinco acciones en un solo lugar (AC-10,
    AC-12, AC-14, AC-15) -- imposible olvidar un caso.
  - La matriz vive como dato (una tabla), no dispersa en cinco `if`.
  - El test unitario recorre la matriz completa contra la tabla.
  Alternativa descartada: un `if (status !== ...)` inline por método. Duplica la
  regla terminal cinco veces y deja la matriz solo implícita; más frágil y más
  difícil de testear. La acción específica (fijar `scheduledAt`, tocar `outcome`)
  SÍ vive en su método; solo se centraliza la legalidad de la transición.

  Mapa conceptual:
  ```
  confirm    : {PROPOSED}
  reschedule : {CONFIRMED}
  cancel     : {PROPOSED, CONFIRMED}
  done       : {CONFIRMED}
  noShow     : {CONFIRMED}
  ```

- **Sin `$transaction` en las transiciones (a diferencia del opt-out de leads).**
  El opt-out corría en tx por la carrera con el bot. Acá el bot solo crea vía
  `propose()` (en `PROPOSED`), nunca transiciona; no hay segundo escritor sobre
  `status`. Para robustez ante dos humanos simultáneos, cada transición se
  implementa como updateMany({ where: { id, tenantId, status: { in:
  origenesValidos } }, data }) y, si afecta 0 filas, se relee para distinguir 404
  (no existe) de 409 (existe pero estado inválido). Esto hace la validación de
  estado atómica en la DB (evita el TOCTOU entre find y update) sin transacción.
  La lectura previa con `findAppointmentOrThrow` sigue existiendo para: (a) 404
  antes de intentar el update, (b) validar `assignedUserId` en `confirm`. Orden:
  findAppointmentOrThrow -> assertTransition -> (confirm) validar assignedUserId
  -> updateMany condicional -> releer y devolver.

### Endpoints

- **`GET :tenantId/appointments`.** DTO `ListAppointmentsQueryDto`:
  - `status?: AppointmentStatus[]` -- mismo patrón que `ListLeadsQueryDto.state`:
    `@Transform` que normaliza a array + `@IsEnum(..., { each: true })` (AC-18).
  - `from?: string`, `to?: string` -- `@IsOptional() @IsDateString()`.
  - Sin paginación en esta spec (la agenda B.2 la definirá; volumen acotado).
    `orderBy: { scheduledAt: { sort: 'asc', nulls: 'last' } }` para que las
    `PROPOSED` sin fecha no encabecen la agenda.
  - Where: siempre `{ tenantId }`; `status` si vino; fecha ver abajo.
  - Respuesta `{ appointments: [...] }` (AC-16).

- **Criterio EXACTO del filtro de fecha del GET.** El rango `from`/`to` se aplica
  sobre **`scheduledAt`**, la fecha operativa real de la visita. Regla:
  - Entra si `scheduledAt` NO es null y cae en `[from, to]`.
  - Las citas con `scheduledAt = null` (típicamente `PROPOSED`, sin fecha
    pactada) NO entran en un rango. El "fallback a `createdAt`" de la spec se
    resuelve así: no se inventa fecha para citas sin `scheduledAt` filtrando por
    `createdAt`; quedan fuera del filtro por rango. Ver las `PROPOSED`
    pendientes se hace con `status=PROPOSED` (sin rango), el caso de uso real de
    "citas por confirmar".

    JUSTIFICACIÓN de no usar `createdAt` como fallback dentro del filtro: mezclar
    dos semánticas de fecha (creación vs visita) en un solo rango daría
    resultados incoherentes en un calendario (una cita sin hora aparecería el día
    que se creó, no el día de la visita). "scheduledAt o nada" es el único
    criterio que produce una agenda correcta. Con `from`/`to` presentes:
    `where.scheduledAt = { gte: from, lte: to }` (Prisma ya excluye los null).
    Sin `from`/`to`, no se filtra por fecha y las `PROPOSED` también aparecen
    (AC-16). (AC-17: "fecha relevante (`scheduledAt` si existe)" -- al no
    existir, no cae en el rango.)

- **`POST :aid/confirm`.** DTO `ConfirmAppointmentDto`: `scheduledAt: string`
  (`@IsDateString()`, requerido -> 400 si falta, AC-2), `assignedUserId?: string`
  (`@IsOptional() @IsString()`), `notes?: string` (`@IsOptional() @IsString()
  @MaxLength(2000)`). Flujo: findAppointmentOrThrow -> assertTransition('confirm')
  (409 si no PROPOSED, AC-3) -> si `assignedUserId` presente, `person.findFirst({
  id, tenantId })`; null -> 400 (AC-5). updateMany condicional a `status =
  PROPOSED` con `{ status: CONFIRMED, scheduledAt, assignedUserId?, notes? }`.
  Devuelve la cita (AC-1, AC-4). `@updatedAt` refresca -> métrica (AC-21).

- **`POST :aid/reschedule`.** DTO `RescheduleAppointmentDto`: `scheduledAt`
  requerido (AC-8), `notes?`. Válido solo desde `CONFIRMED` (409 si no, AC-7).
  Update `{ scheduledAt, notes? }` SIN tocar `status` (AC-6). No acepta `outcome`
  ni `assignedUserId` (whitelist rechaza props extra).

- **`POST :aid/cancel`.** DTO `CancelAppointmentDto`: `notes?` únicamente. Válido
  desde `PROPOSED` o `CONFIRMED` (AC-9); 409 desde terminal (AC-10). Update
  `{ status: CANCELLED, notes? }`.

- **`POST :aid/done` y `POST :aid/no-show`.** DTO compartido
  `CloseAppointmentDto`: `outcome?` (`@IsOptional() @IsString() @MaxLength(...)`),
  `notes?`. Ambos válidos solo desde `CONFIRMED` (409 si no, AC-12/AC-14). Update
  `{ status: DONE|NO_SHOW, outcome?, notes? }` (AC-11, AC-13). Comparten DTO por
  tener el mismo shape de body.

- **Semántica de `notes`/`outcome`: reemplazo, no merge (spec decisión 3).** Se
  aplican solo si vinieron en el body. No hay historial; se sobrescriben. A
  diferencia de A.4, NO se necesita detección `'campo' in rawBody`: `notes` y
  `outcome` no admiten `null` explícito como borrado en esta spec, así que basta
  "si el DTO lo trae, se escribe; si no, no se toca" con `@IsOptional()` sobre el
  DTO transformado. Simplifica respecto del PATCH de assignment de leads.

- **Códigos de estado:**
  - 400: body inválido (falta `scheduledAt`; `assignedUserId` inexistente/otro
    tenant; prop extra por whitelist).
  - 404: `aid` no existe o es de otro `tenantId` (AC-19), mensaje unificado
    'Cita no encontrada'.
  - 409: transición inválida (AC-3, AC-7, AC-10, AC-12, AC-14, AC-15) --
    `ConflictException`, sin modificar la cita.
  - 403: sesión de tenant A pega a `:tenantId` de tenant B -> `TenantScopeGuard`
    corta antes del handler (AC-20).
  - Los POST de transición devuelven 200 (`@HttpCode(200)`, como `release`: mutan
    un recurso existente, no crean).

### Ubicación del controller: AdminModule existente, NO módulo nuevo

- Todos los controllers admin (`leads`, `tenants`, `properties`, `metrics`) ya
  viven en `AdminModule` y comparten guards (`TenantThrottlerGuard`,
  `PersonOrApiKeyGuard`) e imports (`PipelineModule`, `AuthModule`) que este
  controller también necesita. `appointments` bajo `admin/tenants/:tenantId/` es
  idéntico conceptualmente a `leads`. Alternativa descartada
  (`AppointmentsAdminModule` nuevo): duplicaría el registro de guards e imports
  sin ganancia. Se agregan `AppointmentsAdminController` a `controllers` y
  `AppointmentsAdminService` a `providers`. El `AppointmentsService.propose()`
  del bot vive en `src/appointments/` con su `AppointmentsModule`; NO se toca --
  el service admin es independiente y usa `PrismaService` directo, igual que
  `AdminLeadsService`.

### Aislamiento multi-tenant (crítico, ya vigente)

- Ningún endpoint introduce query cross-tenant: todos filtran por el `tenantId`
  del `@Param`, autorizado por `PersonOrApiKeyGuard` (rama sesión ->
  `TenantScopeGuard`, 403 cross-tenant por URL -- AC-20).
- El 404 unificado de `findAppointmentOrThrow` evita el oráculo de existencia
  (AC-19).
- La validación de `assignedUserId` en `confirm` filtra `person.findFirst({ id,
  tenantId })` por el MISMO tenant de la URL: un id de otra inmobiliaria da 400
  indistinguible de inexistente (AC-5).
- El `updateMany` condicional siempre incluye `tenantId` en el `where`.

## Riesgos y edge cases

- **[TOCTOU en la transición]** Dos humanos confirmando/cerrando la misma cita a
  la vez. Resuelto por el `updateMany` condicionado a `status` en el `where`: el
  segundo afecta 0 filas y recibe 409, no pisa el resultado del primero.
- **[NO_SHOW en enum: orden de migración]** `ALTER TYPE ADD VALUE` no puede usarse
  en la misma transacción que lo referencia en algunos Postgres; Prisma lo maneja
  en su migración generada. Verificar que la migración no combine el `ADD VALUE`
  con un uso del valor en el mismo archivo transaccional.
- **[assignedUserId de persona inactiva]** `person.findFirst({ id, tenantId })` NO
  filtra por `active`: se permite asignar a una persona inactiva del tenant (edge
  menor). Si el producto lo prohíbe, agregar `active: true`; decisión de
  producto, no bloqueante. Por defecto NO se filtra.
- **[Filtro de fecha excluye PROPOSED]** Intencional (ver criterio del GET);
  documentar en el test para que no se lea como bug. "Ver pendientes" se cubre
  con `status=PROPOSED` sin rango.
- **[Métrica y updatedAt]** `reschedule`/`cancel`/`done`/`no-show` también tocan
  `updatedAt`. La métrica `confirmed` cuenta `status = CONFIRMED` con `updatedAt`
  en rango: una confirmada y luego `reschedule`-ada dentro del rango sigue
  contando (sigue CONFIRMED), correcto. Una confirmada y luego `done` deja de
  contar como `confirmed` (pasa a DONE) -- esperado; la métrica mide
  "confirmadas actualizadas en el rango". No se cambia (fuera de alcance).
- **[Volumen del GET sin paginar]** Aceptable por volumen acotado por tenant;
  paginar es follow-up de B.2.
- **[Fechas como string ISO]** `scheduledAt` llega ISO string (`@IsDateString`) y
  se convierte a `Date` en el service antes del update.

## Trazabilidad

- **AC-1** -> `confirm`: assertTransition OK desde PROPOSED -> updateMany
  `{status: CONFIRMED, scheduledAt}` -> devuelve la cita.
- **AC-2** -> `ConfirmAppointmentDto.scheduledAt` requerido -> ValidationPipe 400.
- **AC-3** -> assertTransition('confirm') con estado != PROPOSED -> 409.
- **AC-4** -> `confirm` con `assignedUserId` válido -> person.findFirst OK ->
  update con `assignedUserId`.
- **AC-5** -> `assignedUserId` inexistente/otro tenant -> findFirst null -> 400.
- **AC-6** -> `reschedule` desde CONFIRMED -> update `scheduledAt` sin tocar status.
- **AC-7** -> assertTransition('reschedule') con estado != CONFIRMED -> 409.
- **AC-8** -> `RescheduleAppointmentDto.scheduledAt` requerido -> 400.
- **AC-9** -> assertTransition('cancel') OK desde PROPOSED|CONFIRMED -> CANCELLED.
- **AC-10** -> `cancel` desde terminal -> set no incluye terminales -> 409.
- **AC-11** -> `done` desde CONFIRMED -> DONE + outcome/notes si vinieron.
- **AC-12** -> assertTransition('done') con estado != CONFIRMED -> 409.
- **AC-13** -> `no-show` desde CONFIRMED -> NO_SHOW + outcome/notes.
- **AC-14** -> assertTransition('noShow') con estado != CONFIRMED -> 409.
- **AC-15** -> los cinco sets excluyen los tres terminales; cualquier acción desde
  terminal -> 409 sin modificar (tabla central única).
- **AC-16** -> GET sin filtros -> where {tenantId} -> todas las citas del tenant.
- **AC-17** -> GET con from/to -> where.scheduledAt {gte, lte} (excluye null).
- **AC-18** -> GET con status -> where.status {in: [...]}.
- **AC-19** -> findAppointmentOrThrow con findFirst {id, tenantId} -> 404 unificado.
- **AC-20** -> PersonOrApiKeyGuard (rama sesión -> TenantScopeGuard) -> 403 por URL
  cross-tenant antes del handler; e2e de regresión.
- **AC-21** -> `confirm` deja status = CONFIRMED y refresca updatedAt; la query
  existente de MetricsService la cuenta en el rango. Test que confirma y lee.
- **AC-22** -> `AppointmentsService.propose()` intacto: crea en PROPOSED sin
  scheduledAt. e2e de regresión.

## Aprobaciones pendientes

> Todas aprobadas por el usuario (2026-07-24), tal como las proponía el plan.

1. **APROBADO:** Migración Prisma: `NO_SHOW` en el enum + `Appointment.assignedUserId`
   (`SetNull`, relación `"AppointmentAssignee"`) + `Appointment.outcome`, más
   índice `@@index([tenantId, scheduledAt])`.
2. **APROBADO:** Máquina de transiciones central (`assertTransition` + tabla de
   orígenes válidos), con `updateMany` condicionado a `status` para atomicidad
   sin `$transaction`.
3. **APROBADO:** Criterio del filtro de fecha del GET: rango sobre `scheduledAt`;
   las citas sin `scheduledAt` quedan FUERA del rango; las pendientes se ven
   con `status=PROPOSED`.
4. **APROBADO:** Controller/service nuevos en el `AdminModule` existente.
5. **APROBADO:** `confirm` es el único que setea `assignedUserId`; puede
   apuntar a persona inactiva del tenant (no se filtra por `active`).
