# Spec B.2: Vista de agenda (frontend)

## Contexto

B.1 completó el backend de `appointments`: hoy existen `GET
/admin/tenants/:id/appointments` (filtrable por rango de fechas y `status`) y
los cinco endpoints de transición (`confirm`, `reschedule`, `cancel`, `done`,
`no-show`), cada uno con su matriz de transiciones válidas cerrada (ver
`specs/B1-appointments-backend/spec.md`). Sin embargo no existe ninguna
pantalla en el frontend que los consuma: `endpoints.ts` no tiene ninguna
función para `appointments`, no hay ruta `/agenda` ni link de navegación, y
las citas creadas por `AppointmentsService.propose()` (estado `PROPOSED`) no
tienen ningún lugar donde una persona humana pueda verlas o accionarlas.

El plan de producto (`docs/08-PROXIMOS-PASOS.md`, Fase B.2) pide: "Calendario/
lista de visitas por día. Confirmar, reprogramar y marcar resultado con un
click." El resto del panel admin (`LeadsPage`, `PeoplePage`, `DashboardPage`)
usa consistentemente el patrón lista/tabla + filtros + tarjetas, no
calendarios con grilla mensual; no existe ningún componente de calendario en
`frontend/src/components/`. Para mantener consistencia visual y de esfuerzo
con lo ya construido (y porque el volumen esperado de visitas por tenant no
justifica una grilla de calendario), esta spec resuelve "vista de agenda"
como una **lista de visitas agrupada/ordenada por fecha**, con filtro de
rango de fechas y de estado, siguiendo el mismo patrón de `LeadsList` +
`DateRangePicker` (ya construido en A.5) ya validado en el resto del
frontend.

Las acciones de un click (confirmar, reprogramar, cancelar, marcar hecha,
marcar no-show) deben respetar exactamente la matriz de transiciones cerrada
de B.1: la UI solo ofrece, por cada cita, las acciones válidas para su
`status` actual, para no producir 409 evitables contra el backend.

## Alcance

- **Frontend — tipado y funciones de API nuevas** en `endpoints.ts`, sección
  `admin/tenants/:tenantId/appointments`, calcadas de los DTOs/respuestas
  reales de B.1 (sin inventar campos):
  - Tipo `AppointmentStatus = 'PROPOSED' | 'CONFIRMED' | 'DONE' | 'CANCELLED'
    | 'NO_SHOW'`.
  - Tipo `Appointment` (id, tenantId, leadId, status, scheduledAt, notes,
    outcome, assignedUserId, createdAt, updatedAt, y los campos adicionales
    que exponga la respuesta real del backend, p. ej. datos mínimos del lead
    asociado si el endpoint los incluye).
  - `listAppointments(tenantId, query: { from?, to?, status?: AppointmentStatus[] }, token)`
    → `GET :tenantId/appointments`.
  - `confirmAppointment(tenantId, id, { scheduledAt, assignedUserId?, notes? }, token)`
    → `POST :aid/confirm`.
  - `rescheduleAppointment(tenantId, id, { scheduledAt, notes? }, token)` →
    `POST :aid/reschedule`.
  - `cancelAppointment(tenantId, id, { notes? }, token)` → `POST :aid/cancel`.
  - `markAppointmentDone(tenantId, id, { outcome?, notes? }, token)` →
    `POST :aid/done`.
  - `markAppointmentNoShow(tenantId, id, { outcome?, notes? }, token)` →
    `POST :aid/no-show`.

- **Frontend — nueva pantalla `AgendaPage`** en ruta `/agenda`, registrada en
  `App.tsx` bajo `ProtectedRoute`/`AppLayout` igual que el resto, y link "Agenda"
  en el nav de `AppLayout` visible para ambos roles (`OWNER` y `AGENT`):
  - Filtro de rango de fechas reutilizando `DateRangePicker` (o el mismo
    patrón), con default sensato: "hoy" a "próximos 7 días" al entrar, sin
    requerir elegir fechas manualmente para ver algo.
  - Filtro por estado (uno o varios de los cinco valores de
    `AppointmentStatus`), en el mismo estilo que `LeadStateFilter`.
  - Lista de citas del rango/estado filtrado, ordenada por `scheduledAt`
    ascendente (las que no tienen `scheduledAt` aún, es decir `PROPOSED`, se
    agrupan/muestran aparte o al principio, con indicación de que no tienen
    fecha confirmada).
  - Cada fila muestra: fecha/hora (o "sin confirmar" si no la tiene), datos
    del lead asociado, estado (badge, mismo patrón visual que
    `LeadChips`/estado de lead), y el asesor asignado si lo hay.
  - Estados de carga y error reutilizando `Spinner`/`ErrorBanner` (patrón ya
    usado en `LeadsPage`/`DashboardPage`).

- **Frontend — acciones de un click por fila**, mostrando solo las que son
  válidas para el `status` actual de la cita según la matriz cerrada de B.1:
  - `PROPOSED` → "Confirmar" (abre selector de fecha/hora, requerido, más
    asesor opcional; al confirmar invoca `confirmAppointment`) y "Cancelar"
    (invoca `cancelAppointment`, con confirmación antes de ejecutar dado que
    es irreversible).
  - `CONFIRMED` → "Reprogramar" (abre selector de nueva fecha/hora, invoca
    `rescheduleAppointment`), "Cancelar" (con confirmación), "Marcar hecha"
    (invoca `markAppointmentDone`, con campo opcional de resultado/nota) y
    "Marcar no-show" (invoca `markAppointmentNoShow`, con campo opcional de
    nota).
  - `DONE`, `CANCELLED`, `NO_SHOW` → sin acciones (estados terminales): la
    fila solo muestra la información, sin botones de transición.
  - Cada acción, al completarse con éxito, refresca la fila/lista con la cita
    actualizada devuelta por el backend, sin recargar toda la página.
  - Selector de fecha/hora (usado en confirmar y reprogramar) no permite
    enviar el formulario sin una fecha/hora seleccionada.

- **Frontend — feedback de error/éxito**, consistente con el resto del panel:
  - Mientras una acción está en curso, deshabilitar el botón que la disparó
    (evita doble submit).
  - Si el backend rechaza la acción (400/404/409), mostrar un mensaje de
    error legible en español (usando el mismo componente/patrón de error que
    A.3/A.4/A.5), sin dejar la fila en un estado visual inconsistente
    (revierte a mostrar el estado real devuelto o el previo si la llamada
    falló, nunca un estado optimista no confirmado).
  - Si la acción tiene éxito, reflejar el nuevo estado/fecha en la fila sin
    necesidad de recargar manualmente la lista completa.

## Fuera de alcance

- Calendario con grilla mensual/semanal visual: se resuelve como lista
  ordenada por fecha, no grilla.
- Cola de "llamar hoy" y su lógica de priorización (Fase B.3).
- Recordatorio automático de visita 24hs antes (Fase B.4).
- Alerta en tiempo real al asesor sobre nuevas citas (Fase B.5).
- Reasignación de `assignedUserId` fuera del formulario de "Confirmar" (no
  hay endpoint dedicado en B.1; ver spec B.1, fuera de alcance).
- Endpoint o UI para editar `outcome`/`notes` sin transición de estado (no
  existe en el backend).
- Reapertura de citas en estado terminal (`DONE`/`CANCELLED`/`NO_SHOW`): el
  backend las rechaza con 409; la UI directamente no ofrece esas acciones.
- Cualquier cambio al backend de B.1: esta spec consume los endpoints tal
  como quedaron definidos, sin agregar filtros ni campos nuevos al backend.
- Vista de detalle de la cita en pantalla separada (todo se resuelve inline
  en la fila de la lista).
- Notificaciones push/email al confirmar o cancelar una cita.

## Criterios de aceptación (EARS)

**AC-1.** WHEN una persona con sesión válida abre `/agenda` THE SYSTEM SHALL
invocar `GET /admin/tenants/:tenantId/appointments` con el `tenantId` de esa
persona y un rango de fechas por defecto ("hoy" a "próximos 7 días"), sin
requerir que la persona elija fechas manualmente para ver datos.

**AC-2.** WHEN el backend devuelve la lista de citas del rango filtrado THE
SYSTEM SHALL mostrar cada cita con su fecha/hora (o indicación de "sin
confirmar" si `scheduledAt` es nulo), datos del lead asociado, estado
(badge legible en español) y asesor asignado si lo hay, ordenadas por
`scheduledAt` ascendente.

**AC-3.** WHEN una persona selecciona un nuevo rango de fechas o un filtro de
estado en la agenda THE SYSTEM SHALL reinvocar `GET .../appointments` con los
nuevos parámetros y actualizar la lista con la respuesta recibida.

**AC-4.** WHEN se muestra una cita en estado `PROPOSED` THE SYSTEM SHALL
ofrecer únicamente las acciones "Confirmar" y "Cancelar" para esa fila, sin
mostrar "Reprogramar", "Marcar hecha" ni "Marcar no-show".

**AC-5.** WHEN se muestra una cita en estado `CONFIRMED` THE SYSTEM SHALL
ofrecer únicamente las acciones "Reprogramar", "Cancelar", "Marcar hecha" y
"Marcar no-show" para esa fila, sin mostrar "Confirmar".

**AC-6.** WHEN se muestra una cita en estado `DONE`, `CANCELLED` o `NO_SHOW`
THE SYSTEM SHALL NOT ofrecer ninguna acción de transición para esa fila.

**AC-7.** WHEN una persona usa "Confirmar" sobre una cita `PROPOSED` y
selecciona una fecha/hora válida THE SYSTEM SHALL invocar `POST
:aid/confirm` con ese `scheduledAt` (y `assignedUserId`/`notes` si se
completaron), y al recibir éxito actualizar la fila con el nuevo `status`
(`CONFIRMED`) y `scheduledAt` devueltos, sin recargar toda la lista.

**AC-8.** IF una persona intenta confirmar una cita sin seleccionar
fecha/hora THEN THE SYSTEM SHALL NOT invocar `POST :aid/confirm`, mostrando
en cambio un mensaje de validación legible en español.

**AC-9.** WHEN una persona usa "Reprogramar" sobre una cita `CONFIRMED` y
selecciona una nueva fecha/hora válida THE SYSTEM SHALL invocar `POST
:aid/reschedule` con ese `scheduledAt`, y al recibir éxito actualizar la
fila con el nuevo `scheduledAt` devuelto, manteniendo el estado visual
`CONFIRMED`.

**AC-10.** WHEN una persona usa "Cancelar" sobre una cita `PROPOSED` o
`CONFIRMED` THE SYSTEM SHALL pedir confirmación antes de invocar `POST
:aid/cancel`, y al recibir éxito actualizar la fila a `CANCELLED` sin
acciones disponibles.

**AC-11.** WHEN una persona usa "Marcar hecha" sobre una cita `CONFIRMED` THE
SYSTEM SHALL invocar `POST :aid/done` (con `outcome`/`notes` si se
completaron), y al recibir éxito actualizar la fila a `DONE` sin acciones
disponibles.

**AC-12.** WHEN una persona usa "Marcar no-show" sobre una cita `CONFIRMED`
THE SYSTEM SHALL invocar `POST :aid/no-show` (con `outcome`/`notes` si se
completaron), y al recibir éxito actualizar la fila a `NO_SHOW` sin acciones
disponibles.

**AC-13.** WHILE cualquier acción de transición (`confirm`, `reschedule`,
`cancel`, `done`, `no-show`) está en curso para una cita THE SYSTEM SHALL
deshabilitar el/los control(es) que la disparó(aron) para esa fila, evitando
doble envío.

**AC-14.** IF el backend rechaza una acción de transición (400, 404 o 409)
THEN THE SYSTEM SHALL mostrar un mensaje de error legible en español sin
alterar el estado mostrado de la cita a algo distinto del último estado
confirmado por el backend.

**AC-15.** WHILE la llamada a `GET .../appointments` está en curso THE SYSTEM
SHALL mostrar un estado de carga distinguible en la agenda.

**AC-16.** IF la llamada a `GET .../appointments` falla (red o error del
backend) THEN THE SYSTEM SHALL mostrar un mensaje de error legible en
español, sin mostrar una lista vacía indistinguible de "no hay citas en este
rango".

**AC-17.** WHEN una persona con sesión válida de un tenant A hace que la
agenda invoque cualquiera de los endpoints de `appointments` con el
`:tenantId` de un tenant B THE SYSTEM SHALL rechazar la petición (403) sin
mostrar ni modificar citas del tenant B, preservando el aislamiento
multi-tenant ya vigente.

**AC-18.** THE SYSTEM SHALL permitir el acceso a `/agenda` a personas con rol
`OWNER` y con rol `AGENT` por igual (sin restricción de rol adicional a la ya
vigente de sesión válida).

**AC-19.** THE SYSTEM SHALL renderizar toda la agenda (etiquetas de estado,
filtros, formularios de fecha/hora, mensajes de error y de validación) en
español.
