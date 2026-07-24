# Spec B.1: Completar `appointments` en el backend

## Contexto

El bot ya cierra la conversación de agendamiento: `SchedulingHandler.enterScheduling`
llama a `AppointmentsService.propose()`, que crea un `Appointment` con
`status = PROPOSED` y notifica al asesor vía `LeadAlertService`. Ahí termina todo
lo que existe hoy. No hay ningún endpoint que permita a una persona humana
mover esa cita a un estado real: no se puede confirmar fecha/hora, no se puede
reprogramar, no se puede registrar que la visita se hizo, se canceló o el lead
no vino.

Esto deja la métrica `appointments.confirmed` de `MetricsService` — que ya
cuenta `Appointment` con `status = CONFIRMED` actualizados en el rango — en
`0` casi siempre en la práctica, porque nada en el sistema hoy produce una
transición `PROPOSED → CONFIRMED`. La query de métricas ya es correcta; lo que
falta es que exista un camino para que un `Appointment` llegue a `CONFIRMED`
(y a `DONE`/`CANCELLED`/`NO_SHOW`).

Según `docs/08-PROXIMOS-PASOS.md` (B.1), esta es la primera pieza de la Fase B
("Agenda y cola de llamar hoy") y es prerrequisito de B.2 (vista de agenda) y
B.3 (cola de llamar hoy), que van a leer y escribir sobre estas mismas
transiciones desde el frontend.

Sigue el mismo patrón de A.3/A.4: backend puro (sin UI en esta spec),
clasificado `high` por requerir migración de Prisma (cambio de schema, según
`CLAUDE.md`), no crítico, salvo el aislamiento multi-tenant, que sí es crítico
y debe preservarse con el mismo patrón `findFirst({ id, tenantId }) → 404`
unificado ya usado en `leads`.

### Decisiones de modelado (resueltas en esta spec)

**1. Matriz de transiciones de `AppointmentStatus`.**

El enum hoy es `PROPOSED | CONFIRMED | DONE | CANCELLED`. Esta spec agrega
`NO_SHOW` (requiere migración). Las transiciones válidas quedan:

| Desde \ Hacia | CONFIRMED | DONE | CANCELLED | NO_SHOW |
|---|---|---|---|---|
| **PROPOSED**  | ✅ (confirmar, fija `scheduledAt`) | ❌ | ✅ (cancelar antes de confirmar) | ❌ |
| **CONFIRMED** | — (ver reschedule, no es transición de estado) | ✅ (marcar hecha) | ✅ (cancelar ya confirmada) | ✅ (no se presentó) |
| **DONE**      | ❌ | ❌ | ❌ | ❌ |
| **CANCELLED** | ❌ | ❌ | ❌ | ❌ |
| **NO_SHOW**   | ❌ | ❌ | ❌ | ❌ |

Razonamiento:
- `PROPOSED → NO_SHOW` se rechaza: "no se presentó" solo tiene sentido si hubo
  una fecha/hora efectivamente pactada (`scheduledAt`), que recién existe a
  partir de `CONFIRMED`. Sin eso, lo correcto es cancelar (`CANCELLED`), no
  marcar ausencia a una cita que nunca tuvo hora real.
- `PROPOSED → DONE` se rechaza: no se puede marcar una visita como "hecha" sin
  haber pasado por confirmar una fecha; forzaría a inventar un `scheduledAt`
  implícito.
- `DONE`, `CANCELLED` y `NO_SHOW` son **estados terminales**: ninguna
  transición sale de ellos en esta spec (reabrir una cita cancelada o cerrada
  no está pedido por el plan de producto; si se necesita, es una nueva cita).
  Un intento de transicionar desde un estado terminal se rechaza.
- `CONFIRMED → CONFIRMED` no es una transición de estado: es lo que resuelve
  `reschedule` (ver decisión 2).

**2. `reschedule` no cambia `status`, solo actualiza `scheduledAt`, y solo aplica sobre `CONFIRMED`.**

`reschedule` cambia la fecha/hora de una cita que **ya tiene** una fecha
pactada. Una cita en `PROPOSED` todavía no tiene `scheduledAt` (nunca se
confirmó una primera vez), por lo que "reprogramar" no aplica ahí — lo que
corresponde ahí es `confirm` (que sí fija el primer `scheduledAt`). Por eso:
- `confirm` solo es válido desde `PROPOSED` y exige `scheduledAt` en el body.
- `reschedule` solo es válido desde `CONFIRMED`, exige `scheduledAt` en el
  body, actualiza ese campo y **no** toca `status` (sigue `CONFIRMED`).
- Invocar `reschedule` sobre `PROPOSED`, o `confirm` sobre algo que no sea
  `PROPOSED`, se rechaza como transición inválida.

**3. `outcome` y `notes`: campos libres que se completan al cerrar la cita, sin endpoint propio.**

El plan de producto no especifica un catálogo cerrado de resultados posibles,
y agregar un endpoint separado solo para setear `outcome`/`notes` sin cambiar
`status` sería una superficie extra sin un caso de uso pedido. Por eso:
- `outcome` (`String?`, texto libre corto, opcional) resume el resultado de la
  visita: se puede enviar en el body de `done` y de `no-show` (donde tiene
  sentido — hubo o no un desenlace de visita). No se acepta en `confirm`,
  `reschedule` ni `cancel` (ahí no hay "resultado de visita" que resumir).
- `notes` (`String?`, ya existe en el modelo) es texto libre de contexto
  operativo, aceptado opcionalmente en el body de **cualquiera** de los cinco
  endpoints de transición (`confirm`, `reschedule`, `cancel`, `done`,
  `no-show`): si se envía, **reemplaza** el valor anterior (no se concatena,
  igual de simple que el resto del modelo hoy — no hay historial de notas por
  cita en esta spec, a diferencia de `LeadNote` que sí es una tabla de eventos
  porque ahí el plan pedía explícitamente notas repetibles con autor).
- No hay endpoint separado para editar `outcome`/`notes` sin transición de
  estado: si no hay caso de uso pedido, no se agrega.

**4. `Appointment.assignedUserId` es un campo propio, no heredado de `Lead.assignedUserId`.**

`Lead.assignedUserId` (de A.4) identifica quién gestiona el lead en general.
El asesor que efectivamente va a hacer la visita de una cita puntual puede ser
otra persona del mismo tenant (cobertura, reparto de agenda por zona, etc.), y
B.2/B.3 necesitan filtrar/mostrar "mis visitas de hoy" sin depender de a quién
está asignado el lead como un todo. Duplicar la referencia como campo propio
(en vez de resolverla siempre por join a `Lead.assignedUserId`) evita acoplar
la agenda de visitas a la asignación general del lead y permite que ambas
cambien independientemente. Por eso `Appointment` suma su propio
`assignedUserId` (`String?`, FK a `Person`, `onDelete: SetNull`, igual patrón
que `Lead.assignedUserId`). No se autocompleta desde `Lead.assignedUserId` al
crear la cita (mantiene `propose()` simple); se puede setear explícitamente
como parte del body de `confirm` (momento natural en que se decide quién
atiende la visita) y no tiene endpoint propio de reasignación en esta spec —
si hiciera falta reasignar sin recorrer por `confirm` de nuevo, es un
follow-up de B.2.

**5. Aislamiento multi-tenant.**

Todos los endpoints nuevos cuelgan de `admin/tenants/:tenantId/appointments`,
protegidos por los mismos guards que `admin/tenants/:tenantId/leads`
(`TenantThrottlerGuard`, `PersonOrApiKeyGuard` con `TenantScopeGuard` en la
rama de sesión), y siguen el mismo patrón `findFirst({ id, tenantId }) → 404`
unificado que ya usa `AdminLeadsService` (`findLeadOrThrow`), aplicado acá a
un `findAppointmentOrThrow` equivalente. Ningún endpoint resuelve un
`Appointment` solo por `id` sin filtrar también por `tenantId`.

Todos los campos/enum nuevos (`AppointmentStatus.NO_SHOW`,
`Appointment.assignedUserId`, `Appointment.outcome`) **requieren una migración
de Prisma** y quedan marcados como tal en el alcance.

## Alcance

- **Backend — migración de schema**:
  - Agregar `NO_SHOW` al enum `AppointmentStatus`.
  - Agregar a `Appointment`: `assignedUserId` (`String?`, FK a `Person`,
    `onDelete: SetNull`), `outcome` (`String?`).
  - `scheduledAt` y `notes` ya existen en el modelo (`DateTime?` / `String?`),
    no requieren cambio de schema, solo empiezan a usarse de verdad.
  - Índice existente `@@index([tenantId, status])` alcanza para el filtro de
    listado por estado; se evalúa si el filtro por rango de fecha (`GET`)
    necesita un índice adicional sobre `scheduledAt` (`@@index([tenantId,
    scheduledAt])`) — decisión de implementación para el `planner`, no bloquea
    esta spec.

- **Backend — endpoints nuevos**, todos bajo
  `admin/tenants/:tenantId/appointments`, protegidos por los mismos guards que
  el resto del módulo admin, filtrados por `tenantId` y 404 unificado si la
  cita no existe o pertenece a otro tenant:
  - `GET :tenantId/appointments` — lista las citas del tenant, con filtro
    opcional por rango de fechas (`from`/`to`, sobre `scheduledAt` cuando
    existe, o `createdAt` como fallback para citas sin `scheduledAt` — el
    `planner` define el criterio exacto) y por `status` (uno o varios
    valores). Sin filtro, devuelve todas las del tenant.
  - `POST :tenantId/appointments/:aid/confirm` — válido solo desde
    `PROPOSED`. Body: `scheduledAt` (requerido), `assignedUserId` (opcional),
    `notes` (opcional). Transiciona a `CONFIRMED` y fija `scheduledAt`.
  - `POST :tenantId/appointments/:aid/reschedule` — válido solo desde
    `CONFIRMED`. Body: `scheduledAt` (requerido), `notes` (opcional). No
    cambia `status`.
  - `POST :tenantId/appointments/:aid/cancel` — válido desde `PROPOSED` o
    `CONFIRMED`. Body: `notes` (opcional). Transiciona a `CANCELLED`.
  - `POST :tenantId/appointments/:aid/done` — válido solo desde `CONFIRMED`.
    Body: `outcome` (opcional), `notes` (opcional). Transiciona a `DONE`.
  - `POST :tenantId/appointments/:aid/no-show` — válido solo desde
    `CONFIRMED`. Body: `outcome` (opcional), `notes` (opcional). Transiciona a
    `NO_SHOW`.
  - Todos devuelven el `Appointment` actualizado. Un intento de transición
    inválida según la matriz de la sección anterior se rechaza con 409
    (conflicto de estado), sin modificar la cita.

- **Métricas**: sin cambios de código en `MetricsService` — su query de
  `appointments.confirmed` (`status = CONFIRMED`, `updatedAt` en rango) ya es
  correcta; lo que faltaba era que `confirm()` existiera. Se agrega
  verificación (test) de que, tras confirmar una cita, la métrica del rango
  correspondiente la refleje.

## Fuera de alcance

- Vista de agenda / calendario y sus interacciones de un click (Fase B.2).
- Cola de "llamar hoy" y su lógica de priorización (Fase B.3).
- Recordatorio automático de visita 24hs antes (Fase B.4).
- Alerta en tiempo real al asesor sobre nuevas citas (Fase B.5, ya existe
  parcialmente vía `LeadAlertService`, no se toca acá).
- Reapertura de una cita en estado terminal (`DONE`/`CANCELLED`/`NO_SHOW`)
  hacia cualquier otro estado: si se necesita reprogramar después de cancelar
  o de un no-show, se crea una cita nueva (`propose()`), no se reabre la
  vieja.
- Endpoint dedicado para editar `outcome`/`notes` sin transición de estado.
- Reasignación de `assignedUserId` fuera del body de `confirm`.
- Cambios en `SchedulingHandler.enterScheduling` / `AppointmentsService.propose()`
  (siguen creando la cita en `PROPOSED` exactamente igual que hoy).
- Frontend de cualquier tipo.

## Criterios de aceptación (EARS)

**AC-1.** WHEN una persona con sesión válida invoca `POST
:aid/confirm` con un `scheduledAt` válido para una cita en estado `PROPOSED`
de su propio tenant THE SYSTEM SHALL transicionar la cita a `CONFIRMED`, fijar
`scheduledAt` con el valor recibido, y devolver la cita actualizada.

**AC-2.** IF se invoca `POST :aid/confirm` sin `scheduledAt` en el body THEN
THE SYSTEM SHALL rechazar la petición (400) sin modificar la cita.

**AC-3.** IF se invoca `POST :aid/confirm` sobre una cita que no está en
`PROPOSED` THEN THE SYSTEM SHALL rechazar la petición (409) sin modificar la
cita.

**AC-4.** WHEN se invoca `POST :aid/confirm` con `assignedUserId` que
corresponde a una `Person` del mismo tenant THE SYSTEM SHALL asociar esa
persona a la cita como `assignedUserId`.

**AC-5.** IF se invoca `POST :aid/confirm` con un `assignedUserId` que no
existe o pertenece a otro tenant THEN THE SYSTEM SHALL rechazar la petición
(400) sin modificar la cita.

**AC-6.** WHEN una persona con sesión válida invoca `POST :aid/reschedule`
con un `scheduledAt` válido para una cita en estado `CONFIRMED` de su propio
tenant THE SYSTEM SHALL actualizar `scheduledAt` con el nuevo valor,
manteniendo el estado en `CONFIRMED`, y devolver la cita actualizada.

**AC-7.** IF se invoca `POST :aid/reschedule` sobre una cita que no está en
`CONFIRMED` THEN THE SYSTEM SHALL rechazar la petición (409) sin modificar la
cita.

**AC-8.** IF se invoca `POST :aid/reschedule` sin `scheduledAt` en el body
THEN THE SYSTEM SHALL rechazar la petición (400) sin modificar la cita.

**AC-9.** WHEN una persona con sesión válida invoca `POST :aid/cancel` para
una cita en estado `PROPOSED` o `CONFIRMED` de su propio tenant THE SYSTEM
SHALL transicionar la cita a `CANCELLED` y devolverla actualizada.

**AC-10.** IF se invoca `POST :aid/cancel` sobre una cita en estado `DONE`,
`CANCELLED` o `NO_SHOW` THEN THE SYSTEM SHALL rechazar la petición (409) sin
modificar la cita.

**AC-11.** WHEN una persona con sesión válida invoca `POST :aid/done` para
una cita en estado `CONFIRMED` de su propio tenant THE SYSTEM SHALL
transicionar la cita a `DONE`, persistir `outcome`/`notes` si se enviaron, y
devolverla actualizada.

**AC-12.** IF se invoca `POST :aid/done` sobre una cita que no está en
`CONFIRMED` THEN THE SYSTEM SHALL rechazar la petición (409) sin modificar la
cita.

**AC-13.** WHEN una persona con sesión válida invoca `POST :aid/no-show` para
una cita en estado `CONFIRMED` de su propio tenant THE SYSTEM SHALL
transicionar la cita a `NO_SHOW`, persistir `outcome`/`notes` si se
enviaron, y devolverla actualizada.

**AC-14.** IF se invoca `POST :aid/no-show` sobre una cita que no está en
`CONFIRMED` THEN THE SYSTEM SHALL rechazar la petición (409) sin modificar la
cita.

**AC-15.** THE SYSTEM SHALL NOT permitir ninguna transición de estado desde
una cita en `DONE`, `CANCELLED` o `NO_SHOW` hacia cualquier otro estado (todo
intento de `confirm`/`reschedule`/`cancel`/`done`/`no-show` sobre una cita en
uno de estos tres estados se rechaza con 409 sin modificarla).

**AC-16.** WHEN una persona con sesión válida invoca `GET
:tenantId/appointments` sin filtros para su propio tenant THE SYSTEM SHALL
devolver todas las citas de ese tenant.

**AC-17.** WHEN se invoca `GET :tenantId/appointments` con filtro de rango de
fechas THE SYSTEM SHALL devolver únicamente las citas cuya fecha relevante
(`scheduledAt` si existe) cae dentro del rango indicado.

**AC-18.** WHEN se invoca `GET :tenantId/appointments` con filtro de
`status` THE SYSTEM SHALL devolver únicamente las citas cuyo estado coincide
con el/los valor(es) indicado(s).

**AC-19.** IF cualquiera de los endpoints de transición
(`confirm`/`reschedule`/`cancel`/`done`/`no-show`) se invoca con un `aid` que
no existe o pertenece a un `tenantId` distinto del indicado en la URL THEN THE
SYSTEM SHALL responder 404 sin exponer ni modificar datos de esa cita.

**AC-20.** WHEN una persona con sesión válida de un tenant A invoca
cualquiera de los endpoints de esta spec con el `:tenantId` de un tenant B THE
SYSTEM SHALL rechazar la petición (403) sin devolver ni modificar datos de
citas de B, preservando el aislamiento multi-tenant ya vigente.

**AC-21.** WHEN una cita transiciona a `CONFIRMED` mediante `POST
:aid/confirm` dentro de un rango de fechas dado THE SYSTEM SHALL reflejar esa
cita en el conteo `appointments.confirmed` que devuelve `MetricsService` para
ese mismo rango.

**AC-22.** THE SYSTEM SHALL preservar el comportamiento existente de
`AppointmentsService.propose()`: toda cita nueva se sigue creando con
`status = PROPOSED` y sin `scheduledAt`, sin cambios de esta spec.
