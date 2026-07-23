# Spec A.3: Bandeja de leads

## Contexto

A.2 dejó la infraestructura del frontend (login, sesión, layout, cliente HTTP
con manejo uniforme de carga/error) pero ninguna pantalla muestra datos de
negocio todavía. Esta spec (A.3) construye la primera pantalla real: la
bandeja de leads, punto de entrada diario del asesor para ver quién le
escribió, en qué estado está la conversación y qué pidió, sin tener que abrir
el chat completo (eso es A.4).

El backend ya expone `GET /admin/tenants/:tenantId/leads` (filtro por un
único `state`, paginado de a 20, orden fijo por `lastMessageAt` descendente)
y `GET /admin/tenants/:tenantId/leads/:leadId/messages`. No expone hoy
búsqueda por texto (teléfono/nombre) ni un endpoint de detalle de lead sin
el timeline completo de mensajes. Ambas cosas hacen falta para esta pantalla
y entran en el alcance de A.3.

## Alcance

- **Backend — nuevo endpoint `GET /admin/tenants/:tenantId/leads/:leadId`**:
  devuelve la ficha consolidada del lead (todos los campos del modelo `Lead`:
  `phone`, `name`, `state`, `fOperation`, `fNeighborhoods`, `fMaxPrice`,
  `fCurrency`, `fMinRooms`, `fGarage`, `fPetsAllowed`, `fNotes`,
  `lastMessageAt`, `handoffAt`, `optedOutAt`, `createdAt`) **sin** el array de
  mensajes (el timeline es responsabilidad de A.4, que seguirá usando
  `.../messages`). 404 si el lead no existe o no pertenece al `tenantId` de
  la URL. Protegido por los mismos guards que el resto del módulo
  (`TenantThrottlerGuard`, `PersonOrApiKeyGuard`).
- **Backend — extender `ListLeadsQueryDto` y el `where` de `GET .../leads`**
  para aceptar un parámetro de búsqueda de texto libre (`search` o `q`) que
  matchee por `phone` o `name` (contains, case-insensitive), combinable con
  el filtro `state` existente y con la paginación existente. No se agrega
  ordenamiento configurable: el orden sigue siendo fijo por `lastMessageAt`
  descendente, tal como pide el plan de producto.
- **Frontend — pantalla de bandeja de leads**, accesible desde el layout
  autenticado (A.2), que:
  - Lista los leads del tenant de la persona logueada, ordenados por
    `lastMessageAt` descendente (el orden que ya devuelve el backend).
  - Ofrece un filtro por estado con las opciones: nuevo (`GREETING` +
    `QUALIFICATION`, agrupados como "nuevo/calificando" o equivalente legible
    en español), en handoff (`HUMAN_HANDOFF`), agendó (`SCHEDULING`), opt-out
    (`OPTED_OUT`). La agrupación exacta de estados internos en categorías de
    UI queda a criterio del `planner`, siempre que sea consistente con los
    valores reales de `ConversationState` (no se inventan estados que no
    existen en el backend).
  - Ofrece un campo de búsqueda por teléfono o nombre, que invoca el nuevo
    parámetro de búsqueda del backend.
  - Combina filtro de estado + búsqueda + paginación en una sola consulta al
    backend (no filtra client-side sobre una lista ya traída).
  - Por cada lead en la lista, muestra chips legibles con los filtros
    capturados que el lead tenga cargados: operación (`fOperation`), barrio/s
    (`fNeighborhoods`), presupuesto (`fMaxPrice` + `fCurrency`, si existen) y
    ambientes (`fMinRooms`, si existe). Un filtro no capturado (campo `null`
    o array vacío) no muestra chip para ese dato, no se rellena con un
    placeholder inventado.
  - Muestra paginación (siguiente/anterior o equivalente) acorde a `total`,
    `page`, `pageSize` que ya devuelve el backend.
  - Muestra estados de carga y de error reutilizando lo construido en A.2
    (spinner, mensaje de error legible) mientras la lista está en curso o si
    la llamada falla.
  - Cada fila de la lista es un punto de entrada (link/click) hacia la ficha
    del lead, aunque esa pantalla de destino (A.4) todavía no exista: el
    requisito de A.3 es que el click navegue a una ruta de detalle, no que
    esa ruta ya esté completamente implementada.

## Fuera de alcance

- Ficha completa del lead con timeline de mensajes, notas, cambio de estado
  manual y liberar handoff (Fase A.4).
- Dashboard de métricas (Fase A.5).
- Agenda de visitas, cola de "llamar hoy", cualquier acción sobre
  `Appointment` (Fase B).
- Ordenamiento configurable por el usuario (por nombre, por estado, etc.):
  el orden queda fijo por `lastMessageAt` descendente, como ya lo entrega el
  backend hoy.
- Edición de ningún dato del lead desde esta pantalla (la bandeja es de solo
  lectura; las acciones de escritura son de A.4).
- Exportar la lista (CSV, etc.) o cualquier acción masiva sobre varios leads.
- Nuevos estados de `ConversationState` en el backend (ej. un estado "agendó"
  literal distinto de `SCHEDULING`): si el plan de producto necesita esa
  distinción más fina, es una spec de backend separada, no parte de A.3.

## Criterios de aceptación (EARS)

**AC-1.** WHEN una persona con sesión válida abre la pantalla de bandeja de
leads THE SYSTEM SHALL invocar `GET /admin/tenants/:tenantId/leads` con el
`tenantId` de esa persona y mostrar los leads devueltos, ordenados como los
entrega el backend (por `lastMessageAt` descendente), sin reordenarlos ni
inventar datos que el backend no devolvió.

**AC-2.** WHEN una persona selecciona un filtro de estado en la bandeja THE
SYSTEM SHALL reinvocar el listado incluyendo el/los estado(s) de
`ConversationState` correspondientes a ese filtro, y mostrar únicamente los
leads que el backend devuelva para ese filtro.

**AC-3.** WHEN una persona escribe un término de búsqueda (teléfono o
nombre) en el campo de búsqueda de la bandeja THE SYSTEM SHALL invocar el
listado incluyendo ese término como parámetro de búsqueda, y mostrar
únicamente los leads que el backend devuelva como resultado.

**AC-4.** WHEN una persona combina un filtro de estado con un término de
búsqueda THE SYSTEM SHALL enviar ambos parámetros en la misma llamada al
backend, mostrando la intersección que el backend calcule.

**AC-5.** WHEN el backend recibe `GET /admin/tenants/:tenantId/leads` con el
parámetro de búsqueda de texto THE SYSTEM SHALL devolver únicamente leads de
ese `tenantId` cuyo `phone` o `name` contenga el término buscado
(case-insensitive), respetando además el filtro `state` si se envía.

**AC-6.** WHEN una persona con sesión válida solicita
`GET /admin/tenants/:tenantId/leads/:leadId` de un lead que pertenece a su
tenant THE SYSTEM SHALL devolver los datos consolidados del lead (incluidos
los filtros capturados `fOperation`, `fNeighborhoods`, `fMaxPrice`,
`fCurrency`, `fMinRooms`, `fGarage`, `fPetsAllowed`) sin incluir el arreglo
de mensajes.

**AC-7.** IF se solicita `GET /admin/tenants/:tenantId/leads/:leadId` con un
`leadId` inexistente o que pertenece a otro tenant THEN THE SYSTEM SHALL
responder 404 sin exponer ningún dato del lead de otro tenant.

**AC-8.** WHEN un lead listado en la bandeja tiene cargado al menos uno de
los filtros capturados (`fOperation`, `fNeighborhoods`, `fMaxPrice`/
`fCurrency`, `fMinRooms`) THE SYSTEM SHALL mostrar un chip legible en español
por cada uno de esos datos presentes en esa fila.

**AC-9.** IF un lead no tiene cargado alguno de los filtros capturados
(valor `null` o array vacío) THEN THE SYSTEM SHALL NO mostrar un chip para
ese dato en particular, sin mostrar placeholders inventados ("sin
especificar" está permitido como texto fijo de UI, pero nunca un valor de
negocio no devuelto por el backend).

**AC-10.** WHILE la llamada al listado de leads está en curso, THE SYSTEM
SHALL mostrar un estado de carga distinguible en la bandeja.

**AC-11.** IF la llamada al listado de leads falla (red o error del
backend) THEN THE SYSTEM SHALL mostrar un mensaje de error legible en
español en la propia bandeja, sin mostrar una lista vacía indistinguible de
"no hay resultados".

**AC-12.** WHEN el backend devuelve más leads de los que entran en una
página (`total` > `pageSize`) THE SYSTEM SHALL ofrecer un control de
paginación que permita navegar a páginas siguientes y anteriores, invocando
el listado con el parámetro `page` correspondiente.

**AC-13.** WHEN una persona hace click en una fila de la bandeja THE SYSTEM
SHALL navegar a una ruta de detalle de ese lead (identificada por su
`leadId`), sin importar si la pantalla de destino completa (A.4) ya está
implementada.

**AC-14.** WHEN una persona con sesión válida de un tenant A invoca
`GET /admin/tenants/:tenantId/leads` o
`GET /admin/tenants/:tenantId/leads/:leadId` con el `:tenantId` de un tenant
B THE SYSTEM SHALL rechazar la petición (403) sin devolver ningún dato de
leads de B, preservando la garantía de aislamiento multi-tenant ya vigente
en A.2.

**AC-15.** THE SYSTEM SHALL renderizar toda la bandeja de leads (encabezados,
filtros, mensajes de error, textos de los chips) en español.
