# Tasks B.2: Vista de agenda (frontend)

Decisiones ya aprobadas y reflejadas abajo sin volver a discutirlas:
- La fila de cita muestra `leadId` (no se amplía el backend de B.1).
- Etiquetas de estado en español: PROPOSED->"Propuesta", CONFIRMED->"Confirmada",
  DONE->"Realizada", CANCELLED->"Cancelada", NO_SHOW->"No asistió".

Todas las tareas son 100% frontend (no tocan `conversation`, `webhook`,
`pipeline`, `llm`, auth ni migraciones Prisma), por lo que caen en **low** o
**medium** según los criterios del CLAUDE.md del proyecto (CRUD/lectura
filtrada por tenantId y lógica de negocio estándar = medium; copy, config,
boilerplate sin lógica = low).

---

## T1 — Tipos y funciones de API de appointments en endpoints.ts
- **Dificultad:** medium
- **Descripción:** Agregar en `frontend/src/api/endpoints.ts` el tipo
  `AppointmentStatus`, la interfaz `Appointment`, `ListAppointmentsQuery` y las
  seis funciones `listAppointments`, `confirmAppointment`,
  `rescheduleAppointment`, `cancelAppointment`, `markAppointmentDone`,
  `markAppointmentNoShow`, calcadas de los contratos del plan (serialización
  de `status` como parámetros repetidos vía `URLSearchParams`, igual que
  `listLeads.state`). No se modifica ningún DTO ni endpoint del backend.
- **Valida:** AC-1, AC-3, AC-7, AC-9, AC-10, AC-11, AC-12 vía
  `frontend/src/api/endpoints.test.ts`
- **Dependencias:** ninguna
- **Paralelizable:** sí

## T2 — Componente AppointmentStatusBadge
- **Dificultad:** low
- **Descripción:** Crear `frontend/src/components/agenda/AppointmentStatusBadge.tsx`,
  span con `data-testid` que traduce `AppointmentStatus` a la etiqueta en
  español ya aprobada (mapa fijo, sin lógica adicional), mismo patrón visual
  que el badge de estado de `LeadChips`.
- **Valida:** AC-2, AC-19 vía `frontend/src/routes/AgendaPage.test.tsx`
- **Dependencias:** T1
- **Paralelizable:** sí (junto con T3, T4)

## T3 — Componente AppointmentStatusFilter
- **Dificultad:** low
- **Descripción:** Crear `frontend/src/components/agenda/AppointmentStatusFilter.tsx`,
  select con `data-testid="appointment-status-filter"`, opción "Todas" ->
  `undefined` más las cinco opciones en español con `value` igual al valor
  crudo del enum; `onChange` emite `AppointmentStatus[] | undefined` (un solo
  elemento por selección), calcado del contrato de `LeadStateFilter`.
- **Valida:** AC-3, AC-19 vía `frontend/src/routes/AgendaPage.test.tsx`
- **Dependencias:** T1
- **Paralelizable:** sí (junto con T2, T4)

## T4 — Componente AppointmentActionForm
- **Dificultad:** medium
- **Descripción:** Crear `frontend/src/components/agenda/AppointmentActionForm.tsx`,
  formulario inline para confirmar/reprogramar: input
  `data-testid="scheduled-at-input"` (datetime-local), selector opcional de
  asesor y campo de notas (solo en confirmar), botón submit rotulado
  "Confirmar cita" o "Reprogramar cita" (evita colisión con el regex anclado
  `/^confirmar$/i` de AC-5), botón "Volver" para cerrar sin colisionar con
  "Cancelar" de la fila. Valida que haya fecha/hora antes de invocar al
  callback del padre; si falta, muestra "Selecciona una fecha y hora" en
  español y no invoca nada. Convierte el valor del input a ISO string antes
  de emitirlo.
- **Valida:** AC-7, AC-8, AC-9, AC-19 vía `frontend/src/routes/AgendaPage.test.tsx`
- **Dependencias:** T1
- **Paralelizable:** sí (junto con T2, T3)

## T5 — Componente AppointmentRow
- **Dificultad:** medium
- **Descripción:** Crear `frontend/src/components/agenda/AppointmentRow.tsx`,
  fila con `data-testid="appointment-row"`: muestra fecha/hora o "sin
  confirmar" (`scheduledAt === null`), `leadId`, `AppointmentStatusBadge` y
  asesor asignado. Implementa la matriz de acciones válidas por `status`
  (PROPOSED: Confirmar/Cancelar; CONFIRMED: Reprogramar/Cancelar/Marcar
  hecha/Marcar no-show; DONE/CANCELLED/NO_SHOW: ninguna), rotulando el botón
  de la fila exactamente "Confirmar" (para el negativo anclado de AC-5).
  Mientras el formulario de confirmar/reprogramar está abierto, reemplaza los
  botones de la fila por `AppointmentActionForm` (Decisión 4 del plan, evita
  colisión de nombres accesibles). Cancelar invoca `window.confirm(...)`
  antes de llamar a `cancelAppointment`. Maneja estado local `{ pending,
  actionError }` por fila: deshabilita el botón disparador mientras
  `pending`, y en `catch` muestra `ErrorBanner` con `err.message` sin
  cambiar el `status` mostrado. Invoca las funciones de T1 correspondientes
  y delega al padre (AgendaPage, vía prop `onUpdated`) el reemplazo in-place
  de la cita con el objeto devuelto por el backend.
- **Valida:** AC-2, AC-4, AC-5, AC-6, AC-7, AC-9, AC-10, AC-11, AC-12, AC-13,
  AC-14, AC-19 vía `frontend/src/routes/AgendaPage.test.tsx`
- **Dependencias:** T1, T2, T3, T4
- **Paralelizable:** no

## T6 — Componente AppointmentsList
- **Dificultad:** low
- **Descripción:** Crear `frontend/src/components/agenda/AppointmentsList.tsx`,
  envoltorio con `data-testid="appointments-list"` que recibe el array de
  citas ya cargado, lo ordena por `scheduledAt` ascendente con las
  `PROPOSED` (sin fecha) al final, y mapea a `AppointmentRow` pasando el
  callback de actualización in-place.
- **Valida:** AC-2 vía `frontend/src/routes/AgendaPage.test.tsx`
- **Dependencias:** T5
- **Paralelizable:** no

## T7 — Página AgendaPage
- **Dificultad:** medium
- **Descripción:** Crear `frontend/src/routes/AgendaPage.tsx`: `<h1>Agenda</h1>`,
  estado local `{ range: {from, to}, statusFilter }` con rango por defecto
  "hoy" a "+7 días" (patrón `defaultRange()` de `DashboardPage`), lee
  `tenantId`/`token` de `useAuth()` (nunca hardcodeado), usa
  `useApi(listAppointments)` y dispara `run(tenantId, query, token)` en un
  `useEffect` sobre `[tenantId, range, statusFilter]`. Renderiza
  mutuamente excluyente `Spinner` (loading) / `ErrorBanner` (error) /
  `AppointmentsList` (data), montando `AppointmentsList` solo cuando
  `!loading && !error`. Mantiene copia local de `appointments` en
  `useState`, reemplazada al resolver `listAppointments` y actualizada
  in-place (por `id`) cuando una fila reporta una cita actualizada, sin
  volver a invocar `listAppointments`. Incluye `AppointmentStatusFilter` y
  el filtro de rango de fechas (reutilizando `DateRangePicker`).
- **Valida:** AC-1, AC-2, AC-3, AC-13, AC-14, AC-15, AC-16, AC-17, AC-19 vía
  `frontend/src/routes/AgendaPage.test.tsx`
- **Dependencias:** T1, T6
- **Paralelizable:** no

## T8 — Link "Agenda" en el nav de AppLayout
- **Dificultad:** low
- **Descripción:** Agregar en `frontend/src/routes/AppLayout.tsx` un
  `Link to="/agenda"` con texto exacto "Agenda" en el nav, fuera del guard
  `person?.role === 'OWNER'` (visible tanto para OWNER como para AGENT).
- **Valida:** AC-18 vía `frontend/src/routes/AppLayout.test.tsx`
- **Dependencias:** ninguna
- **Paralelizable:** sí

## T9 — Ruta /agenda en App.tsx
- **Dificultad:** low
- **Descripción:** Agregar en `frontend/src/App.tsx` una `Route
  path="agenda" element={<AgendaPage />}` dentro del bloque
  `ProtectedRoute`+`AppLayout` (junto a leads/dashboard/people), con el
  import correspondiente de `AgendaPage`.
- **Valida:** AC-1, AC-18 vía `frontend/src/App.test.tsx`
- **Dependencias:** T7
- **Paralelizable:** no

---

## Orden de ejecución sugerido

**Grupo 1 (paralelo, sin dependencias):** T1, T8

**Grupo 2 (paralelo, depende de T1):** T2, T3, T4

**Grupo 3 (secuencial, depende de T2+T3+T4+T1):** T5

**Grupo 4 (secuencial, depende de T5):** T6

**Grupo 5 (secuencial, depende de T6+T1):** T7

**Grupo 6 (secuencial, depende de T7):** T9

T8 puede integrarse en cualquier momento en paralelo a toda la cadena T1→T9,
ya que no comparte archivos ni dependencias con el resto.

## Huecos de cobertura

Ninguno detectado: los 19 AC de `spec.md` quedan cubiertos por al menos una
tarea, y cada tarea apunta a uno de los cuatro archivos de test ya
existentes (`AgendaPage.test.tsx`, `endpoints.test.ts`, `AppLayout.test.tsx`,
`App.test.tsx`).
