# Plan B.2: Vista de agenda (frontend)

## Arquitectura

Feature 100% frontend que consume el backend ya cerrado de B.1. No se toca
NestJS, Prisma ni ningun DTO del backend: se consumen los endpoints tal cual
quedaron. La pantalla sigue el mismo patron ya validado en el resto del panel
admin (A.3/A.4/A.5): pagina contenedora con estado local + useApi + render
mutuamente excluyente de Spinner / ErrorBanner / lista, filtros arriba
reutilizando los componentes existentes, y funciones tipadas nuevas en
endpoints.ts que delegan en request().

Flujo de datos (identico al de LeadsPage/DashboardPage):

AppLayout (nav: link "Agenda")
  -> /agenda  (App.tsx: Route bajo ProtectedRoute + AppLayout)
       -> AgendaPage
            estado local: { range:{from,to}, statusFilter }
            useAuth() -> tenantId, token   (nunca hardcode)
            useApi(listAppointments) -> loading/error/data
            useEffect([tenantId, range, statusFilter]) -> run(...)
              - Spinner            (loading)                 AC-15
              - ErrorBanner        (error)                   AC-16
              - AppointmentsList (data.appointments)
                   -> AppointmentRow  (una por cita)         AC-2,4,5,6
                        - badge de estado (es-AR)            AC-2,19
                        - acciones validas segun status      AC-4,5,6
                        - AppointmentActionForm (inline)     AC-7..12

Cada accion de transicion se ejecuta contra endpoints.*Appointment(...) y, al
resolver, reemplaza en el estado local SOLO esa cita con el objeto Appointment
devuelto por el backend (fuente de verdad), sin re-fetch de toda la lista
(AC-7/9/10/11/12: listAppointments sigue habiendo sido llamado una sola vez). El
tenantId/token salen siempre de AuthContext; el aislamiento multi-tenant es
responsabilidad del backend (403), la UI nunca pasa un tenantId arbitrario
(AC-17).

Decision de alcance ya tomada en la spec: "agenda" = lista ordenada por
scheduledAt asc, no grilla de calendario. Se respeta porque no existe ningun
componente de calendario en el repo y el patron lista+filtros es el unico
vigente.

## Entidades / modulos afectados

### Nuevos

- frontend/src/routes/AgendaPage.tsx: pagina contenedora. Estado local de rango
  y filtro de estado, carga via useApi(listAppointments), mantiene la copia
  local de la lista para actualizar filas in-place tras cada accion. Renderiza
  <h1>Agenda</h1> (el test de App.test.tsx busca heading /agenda/i).
- frontend/src/components/agenda/AppointmentStatusFilter.tsx: select con
  data-testid="appointment-status-filter". Opciones: "Todas" (-> undefined) mas
  los cinco estados con label en espanol; onChange emite AppointmentStatus[] |
  undefined. Al elegir un estado emite un array de un elemento (['CONFIRMED']),
  calcado del contrato de LeadStateFilter (AC-3: el test hace
  selectOptions(filter, 'CONFIRMED') y espera status: ['CONFIRMED'], por lo que
  los value de las opciones deben ser los valores crudos del enum).
- frontend/src/components/agenda/AppointmentsList.tsx: envoltorio con
  data-testid="appointments-list"; mapea a AppointmentRow. Ordena por
  scheduledAt asc con las PROPOSED (sin fecha) al final, replicando el orderBy
  nulls:last del backend para no depender del orden de red.
- frontend/src/components/agenda/AppointmentRow.tsx: fila con
  data-testid="appointment-row". Muestra fecha/hora o "sin confirmar"
  (scheduledAt === null), datos del lead, badge de estado y asesor asignado.
  Decide que botones renderizar segun status (matriz de B.1). Maneja el estado
  local de "accion en curso" para deshabilitar el boton disparador (AC-13) y el
  error por-fila.
- frontend/src/components/agenda/AppointmentStatusBadge.tsx: traduce
  AppointmentStatus a etiqueta en espanol (mismo patron visual que LeadChips,
  span con testid). Mapa: PROPOSED->"Propuesta", CONFIRMED->"Confirmada",
  DONE->"Realizada", CANCELLED->"Cancelada", NO_SHOW->"No asistio". AC-19
  verifica literalmente "Confirmada".
- frontend/src/components/agenda/AppointmentActionForm.tsx: formulario inline
  que aparece al pulsar "Confirmar"/"Reprogramar". input type=datetime-local con
  data-testid="scheduled-at-input", mas (en confirmar) selector opcional de
  asesor y campo de notas. Boton de submit con nombre que matchea
  /guardar|confirmar cita/i o /guardar|reprogramar cita/i. Valida que haya
  fecha/hora antes de invocar; si falta, muestra "Selecciona una fecha y hora" y
  no llama al endpoint (AC-8).

### Modificados

- frontend/src/api/endpoints.ts: agrega la seccion
  admin/tenants/:tenantId/appointments: tipos AppointmentStatus, Appointment, y
  las seis funciones (detalle abajo).
- frontend/src/App.tsx: nueva Route path=agenda element=AgendaPage dentro del
  bloque ProtectedRoute+AppLayout (junto a leads/dashboard/people). Import de
  AgendaPage.
- frontend/src/routes/AppLayout.tsx: agrega Link to=/agenda con texto "Agenda"
  en el nav, FUERA del guard person?.role === 'OWNER' (visible para OWNER y
  AGENT, AC-18). El texto exacto "Agenda" es el que asertan los tests de
  AppLayout.test.tsx.

### Backend

Sin cambios. B.1 ya expone GET /admin/tenants/:tenantId/appointments (filtros
from/to/status[]) y los cinco POST de transicion, protegidos por
PersonOrApiKeyGuard + TenantThrottlerGuard. El 403 de aislamiento multi-tenant
(AC-17) y los 400/404/409 (AC-14) ya estan implementados ahi.

## Contratos nuevos en endpoints.ts

Calcados de Appointment de Prisma y de los DTOs reales de B.1. Serializacion de
status como parametros repetidos (no CSV), igual que listLeads.state (el test de
endpoints.test.ts exige la URL exacta ...?status=PROPOSED&status=CONFIRMED).

    export type AppointmentStatus =
      | 'PROPOSED' | 'CONFIRMED' | 'DONE' | 'CANCELLED' | 'NO_SHOW';

    export interface Appointment {
      id: string;
      tenantId: string;
      leadId: string;
      status: AppointmentStatus;
      scheduledAt: string | null;   // ISO; null mientras PROPOSED
      notes: string | null;
      outcome: string | null;
      assignedUserId: string | null;
      createdAt: string;
      updatedAt: string;
      // Nota: el service B.1 devuelve el modelo Appointment pelado (findMany sin
      // include). Los datos del lead asociado de AC-2 se resuelven con lo que la
      // fila trae hoy (leadId). Ver Riesgo R1.
    }

    export interface ListAppointmentsQuery {
      from?: string; to?: string; status?: AppointmentStatus[];
    }

    listAppointments(tenantId, query, token)
      -> GET .../appointments[?from&to&status(repetido)]
      -> Promise<{ appointments: Appointment[] }>
    confirmAppointment(tenantId, id,
      { scheduledAt: string; assignedUserId?: string; notes?: string }, token)
      -> POST .../:id/confirm -> Promise<Appointment>
    rescheduleAppointment(tenantId, id, { scheduledAt: string; notes?: string }, token)
      -> POST .../:id/reschedule -> Promise<Appointment>
    cancelAppointment(tenantId, id, { notes?: string }, token)
      -> POST .../:id/cancel -> Promise<Appointment>
    markAppointmentDone(tenantId, id, { outcome?: string; notes?: string }, token)
      -> POST .../:id/done -> Promise<Appointment>
    markAppointmentNoShow(tenantId, id, { outcome?: string; notes?: string }, token)
      -> POST .../:id/no-show -> Promise<Appointment>

Construccion de la query string identica al patron existente: URLSearchParams,
params.append('status', s) por cada estado, params.set('from'/'to', ...), sufijo
? solo si hay params. El test espera from/to URL-encoded (%3A en los :), lo que
sale gratis de URLSearchParams.

## Matching con los testids que ya esperan los tests

- appointments-list -> AppointmentsList (solo se monta con !loading && !error).
- appointment-row (una por cita) -> AppointmentRow.
- appointment-status-filter -> AppointmentStatusFilter (select).
- scheduled-at-input -> input type=datetime-local en AppointmentActionForm.
- spinner -> Spinner existente; error-banner -> ErrorBanner existente.
- botones por nombre accesible: /confirmar/i, /cancelar/i, /reprogramar/i,
  /marcar hecha/i, /marcar no-show/i, submit /guardar|confirmar cita/i,
  /guardar|reprogramar cita/i -> AppointmentRow / AppointmentActionForm.
- texto /sin confirmar/i -> AppointmentRow cuando scheduledAt === null.
- texto "Confirmada" -> AppointmentStatusBadge.
- heading /agenda/i -> h1 "Agenda" en AgendaPage; texto "Agenda" en nav -> Link.

Detalle sensible de nombres accesibles: en AC-5 el test asegura que en una fila
CONFIRMED NO aparezca /^confirmar$/i (anclado) pero si Reprogramar, Marcar hecha,
etc. En AC-4 la fila PROPOSED debe tener Confirmar y Cancelar y ninguna otra. Por
eso el boton de abrir el form de confirmacion se rotula exactamente "Confirmar",
y el submit del form "Confirmar cita" (o "Guardar") para no colisionar con el
regex anclado. El boton Cancelar de la fila (transicion) y un eventual boton de
cerrar el form comparten regex /cancelar/i; para evitar ambiguedad en
AC-4/AC-10 el form REEMPLAZA los botones de la fila mientras esta abierto y usa
"Volver" para cerrarse (ver Decision 4).

## Manejo de estado / loading / error

- Carga de lista: useApi(listAppointments) exactamente como DashboardPage usa
  getMetrics. useEffect sobre [tenantId, range, statusFilter] dispara
  run(tenantId, query, token).catch(()=>{}). loading->Spinner (AC-15),
  error->ErrorBanner y NO se monta appointments-list (AC-16: lista vacia por
  error != lista vacia por "no hay citas").
- Copia local de la lista: AgendaPage guarda appointments en useState,
  inicializado/reemplazado cuando listAppointments resuelve. Las acciones de
  transicion no re-disparan listAppointments; sustituyen la cita por su version
  devuelta (setAppointments(prev => prev.map(a => a.id === u.id ? u : a))), lo
  que satisface actualizar la fila sin recargar la lista (AC-7/9/11/12) y el
  cambio a estado terminal sin acciones (AC-6 aplica sobre la fila actualizada).
- Acciones por fila: cada AppointmentRow tiene su propio estado { pending,
  actionError }. Al invocar, pending=true deshabilita el boton disparador
  (AC-13); en catch setea actionError y NO cambia el status mostrado (AC-14, la
  fila conserva el ultimo estado confirmado por el backend). El error se muestra
  en un ErrorBanner (data-testid=error-banner) -- el test AC-14 lee error-banner
  con el message del Error rechazado, asi que el texto del banner es err.message,
  tal como errorMessage() en las otras paginas.
- Cancelar: window.confirm(...) antes de invocar cancelAppointment (AC-10; el
  test mockea window.confirm). Si el usuario cancela el confirm, no se invoca el
  endpoint.
- Validacion de fecha: el submit del AppointmentActionForm chequea que el
  datetime-local no este vacio; si lo esta, muestra "Selecciona una fecha y hora"
  y aborta sin llamar al endpoint (AC-8). El valor (2026-07-25T15:00) se convierte
  a ISO string antes de enviar (el test solo exige scheduledAt: any(String)).

## Decisiones tecnicas

- Lista ordenada por fecha, sin grilla de calendario -- la spec y el estado del
  repo lo imponen: no hay componente calendario, el patron lista+filtros es el
  unico vigente. Se descarta una lib de calendario (violaria "no dependencias
  pesadas sin justificacion").
- Ordenamiento replicado en el cliente -- AppointmentsList reordena por
  scheduledAt asc con nulos al final aunque el backend ya lo haga. Justificacion:
  tras una accion la fila se reemplaza in-place y puede cambiar su scheduledAt;
  reordenar en cliente mantiene la invariante de AC-2 sin re-fetch. Descartado:
  re-fetch tras cada accion (contradice AC-7 y su toHaveBeenCalledTimes(1)).
- Actualizacion in-place con el objeto devuelto por el backend -- fuente de
  verdad, nunca estado optimista. Justificacion: AC-14 exige no mostrar un estado
  distinto al ultimo confirmado por el backend; el backend puede tocar otros
  campos (notes). Descartado el update optimista.
- Filtro single-select que emite array -- imita LeadStateFilter: onChange emite
  [valor] o undefined para Todas. Justificacion: el test espera status:
  ['CONFIRMED']; un multiselect no es necesario. El tipo del endpoint acepta
  AppointmentStatus[], asi que un futuro multiselect no rompe el contrato.
  Descartado: checkboxes multiples (YAGNI).
- Decision 4 -- el form de accion reemplaza los botones de la fila mientras esta
  abierto. Justificacion: evita colision de nombres accesibles (Cancelar de la
  fila vs cerrar el form; Confirmar que abre vs submit). Mantiene el DOM simple
  para within(row).getByRole. Descartado modal/portal (romperia el scoping
  within(row) de los tests).
- datetime-local como selector -- nativo, sin dependencias, valor 2026-07-25T15:00
  que el test tipea directo; se convierte a ISO antes de enviar. Descartado un
  date-picker de libreria.
- Nav Agenda fuera del guard de rol -- junto a Leads/Panel. Justificacion directa
  de AC-18 y de los dos tests de AppLayout.test.tsx (OWNER y AGENT ven Agenda).
- Sin cambios de backend -- todos los AC se cubren consumiendo B.1 tal cual. No
  agregar include: { lead } al GET (spec: sin agregar campos al backend). Ver R1.

## Riesgos y edge cases

- R1 -- "datos del lead asociado" (AC-2) vs. respuesta pelada de B.1. El list()
  de B.1 hace findMany sin include, asi que la respuesta trae leadId pero no
  nombre/telefono del lead. Con el backend congelado, la fila muestra leadId y el
  resto de campos requeridos (fecha, estado, asesor). Es la principal decision
  que requiere confirmacion humana: aceptar mostrar leadId, o reabrir B.1 para
  incluir datos minimos del lead (fuera del alcance de esta spec). Los tests solo
  verifican que la fila exista con estado + "sin confirmar", no un nombre; es
  decision de producto.
- R2 -- colision de nombres accesibles Cancelar/Confirmar. Mitigado por Decision
  4 y por rotular el submit del form como "Confirmar cita"/"Reprogramar cita". El
  boton de la fila debe ser exactamente "Confirmar" (para /^confirmar$/i negativo
  en AC-5 sobre CONFIRMED, que no lo renderiza).
- R3 -- doble submit / carrera. pending por fila deshabilita el boton (AC-13). El
  backend es atomico (updateMany condicionado -> 409 si hubo carrera), que la UI
  muestra como error legible (AC-14).
- R4 -- zona horaria del datetime-local. Valor local sin TZ; al convertir a ISO
  se fija el offset del navegador. Consistente con DateRangePicker. El backend
  valida IsDateString.
- R5 -- rango por defecto hoy a +7 dias. Calculado una vez en el init de useState
  (patron defaultRange() de DashboardPage). El test verifica diffDays entre 6 y
  7; to = hoy + 7d con from a inicio de dia es seguro. Se envian como ISO.
- R6 -- seguridad multi-tenant. La UI nunca compone un tenantId distinto al de la
  sesion; el 403 (AC-17) lo garantiza el guard del backend. tenantId sale de
  AuthContext (verificado por AC-17, que cambia a tenant-9 y espera esa id).

## Trazabilidad

- AC-1: AgendaPage monta -> useEffect llama listAppointments(tenantId, {from,to},
  token) con rango default hoy..+7d (defaultRange).
- AC-2: AppointmentRow (fecha o "sin confirmar", leadId, badge, asesor) + orden
  asc en AppointmentsList.
- AC-3: cambio de rango/AppointmentStatusFilter -> re-dispara listAppointments con
  nuevos params (status:['CONFIRMED']).
- AC-4: AppointmentRow renderiza solo Confirmar+Cancelar si status PROPOSED.
- AC-5: AppointmentRow renderiza Reprogramar/Cancelar/Marcar hecha/Marcar no-show
  si CONFIRMED, sin Confirmar.
- AC-6: AppointmentRow no renderiza ningun boton para DONE/CANCELLED/NO_SHOW.
- AC-7: AppointmentActionForm (confirmar) -> confirmAppointment; update in-place;
  listAppointments una sola vez.
- AC-8: validacion de scheduled-at-input vacio -> mensaje, no llama al endpoint.
- AC-9: form (reprogramar) -> rescheduleAppointment; mantiene badge Confirmada.
- AC-10: boton Cancelar -> window.confirm -> cancelAppointment; fila a CANCELLED.
- AC-11: Marcar hecha -> markAppointmentDone; fila DONE sin acciones.
- AC-12: Marcar no-show -> markAppointmentNoShow; fila NO_SHOW sin acciones.
- AC-13: estado pending por fila deshabilita el boton disparador.
- AC-14: catch de la accion -> ErrorBanner con err.message, status sin cambiar.
- AC-15: Spinner mientras useApi.loading de listAppointments.
- AC-16: ErrorBanner en error; appointments-list no se monta.
- AC-17: tenantId/token siempre de AuthContext; backend responde 403.
- AC-18: Link to=/agenda fuera del guard de rol; ruta bajo ProtectedRoute.
- AC-19: AppointmentStatusBadge y filtros/labels/mensajes en espanol.

## Decisiones que requieren aprobacion humana

1. R1 -- datos del lead en la fila (AC-2). B.1 devuelve el appointment sin datos
   del lead. Propuesta: mostrar leadId sin reabrir B.1. Si producto quiere
   nombre/telefono del lead, hay que ampliar el GET de B.1 (nueva tarea backend,
   fuera del alcance de esta spec). Necesito confirmacion antes de task-splitter.
2. Etiquetas de estado en espanol: PROPOSED->Propuesta, CONFIRMED->Confirmada,
   DONE->Realizada, CANCELLED->Cancelada, NO_SHOW->No asistio. "Confirmada" es la
   unica fijada por un test (AC-19); las otras cuatro conviene aprobarlas para
   consistencia de copy.

Espero visto bueno en estos dos puntos antes de avanzar a task-splitter.
