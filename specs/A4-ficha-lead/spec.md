# Spec A.4: Ficha del lead

## Contexto

A.3 dejó la bandeja de leads (lista, filtros, búsqueda, chips) y un endpoint
de detalle consolidado (`GET /admin/tenants/:tenantId/leads/:leadId`) que
devuelve todos los campos del lead sin el timeline de mensajes. El frontend
tiene hoy `LeadDetailPage.tsx` como placeholder en la ruta `/leads/:leadId`:
`LeadsList`/`LeadRow` ya navegan ahí, pero la pantalla no muestra nada real.

Según `docs/08-PROXIMOS-PASOS.md` (A.4), el asesor necesita, desde esa ficha,
tres cosas que hoy no existen en ningún lado: leer el historial completo de la
conversación en un solo lugar, dejar una nota sobre lo que habló con el lead
(fuera del bot), y registrar que ya lo contactó / mover su estado de gestión
manualmente — incluyendo liberar un handoff y suprimir el lead, cuyos
endpoints (`POST .../release`, `DELETE :leadId`) ya existen desde A.3 pero
ningún frontend los invoca todavía.

El criterio de aceptación del plan de producto es explícito: **"un asesor
puede leer el chat, dejar una nota y marcar el lead como 'contactado' desde
la web"**. Ninguno de los tres verbos existe hoy como acción de escritura
disponible para una persona autenticada; hoy solo el propio bot escribe sobre
el lead.

### Decisiones de modelado (resueltas en esta spec)

**1. Notas: tabla `LeadNote` nueva, no reutilizar `fNotes`.**
`fNotes` ya existe en `Lead`, pero es un campo que llena el *bot* durante la
calificación ("extras en lenguaje natural" capturados de la conversación, ver
`docs/02-DATOS.md` y el comentario en el schema). Reutilizarlo para notas
humanas mezclaría dos fuentes de verdad distintas (LLM/FSM vs. persona) sobre
el mismo campo, y una nota humana pisaría silenciosamente lo que capturó el
bot (o viceversa). El plan de producto además habla de poder "dejar una nota"
como evento repetible con autor y fecha, no de un campo único sobre-escribible.
Por eso esta spec agrega una tabla `LeadNote` (una fila por nota: `leadId`,
`tenantId`, autor —`personId`—, texto, fecha de creación), de solo
alta+lectura (sin edición ni borrado de notas individuales en el alcance de
A.4). Esto **requiere migración de Prisma** (clasificado `high`, no crítico
según `CLAUDE.md`, salvo la relación con `tenantId` que debe respetar el
aislamiento multi-tenant igual que el resto del modelo).

**2. "Cambiar estado manual": no es mover libremente el `ConversationState`.**
La FSM en código controla el flujo del bot (principio rector de `CLAUDE.md`);
darle a una persona un selector que mueva el lead a cualquier valor de
`ConversationState` (incluido `GREETING` o `SEARCH_MATCH`, que son pasos
internos de una conversación en curso) rompería esa garantía y podría dejar
al bot en un estado inconsistente con lo que realmente se habló. En cambio:
- **Marcar "contactado"** es una anotación humana sobre la *gestión* del
  lead, no un estado de la FSM: se modela como un campo nuevo `contactedAt`
  (`DateTime?`, se completa al marcar, se puede volver a poner en blanco para
  "desmarcar"). No se toca el enum `ConversationState`.
- Las únicas transiciones de `ConversationState` que una persona puede
  disparar desde la ficha son las que ya existen como acciones explícitas y
  acotadas del backend: **liberar handoff** (`HUMAN_HANDOFF → QUALIFICATION`,
  vía `POST .../release`, ya implementado en A.3) y **opt-out manual**
  (`* → OPTED_OUT`, equivalente humano de que el lead pida baja, nuevo en
  A.4). No se agrega un selector genérico de estado.
- Esto cumple el criterio del plan de producto (marcar "contactado") sin
  convertir el panel humano en una puerta trasera de la FSM.

**3. `assignedUserId` y `nextActionAt`: sí van en el alcance de A.4.**
El plan de producto los lista explícitamente en la sección A.4 (aunque B.3
los va a *usar* más pesadamente para priorizar la cola de llamado). Como A.4
es la spec que primero los necesita para existir, esta spec agrega ambos
campos al modelo `Lead`:
- `assignedUserId` (`String?`, referencia a `Person.id`, nullable — sin
  asignar por defecto).
- `nextActionAt` (`DateTime?`, fecha/hora libre que carga el asesor para
  "volver a este lead el día X").
B.3 se apoya en estos campos ya existentes; no se duplica su definición ahí.

Todos los campos/tabla nuevos (`LeadNote`, `Lead.contactedAt`,
`Lead.assignedUserId`, `Lead.nextActionAt`) **requieren una migración de
Prisma** y quedan marcados como tal en el alcance.

## Alcance

- **Backend — migración de schema**: agregar tabla `LeadNote` (`id`,
  `tenantId`, `leadId`, `authorPersonId`, `body`, `createdAt`) con índice por
  `(tenantId, leadId)`, y agregar a `Lead` los campos `contactedAt`
  (`DateTime?`), `assignedUserId` (`String?`, FK a `Person`, `SetNull` on
  delete), `nextActionAt` (`DateTime?`).
- **Backend — endpoints nuevos**, todos bajo `admin/tenants/:tenantId/leads`,
  protegidos por los mismos guards que el resto del módulo
  (`TenantThrottlerGuard`, `PersonOrApiKeyGuard`), filtrados por `tenantId` y
  404 si el lead no existe o pertenece a otro tenant:
  - `POST :leadId/notes` — crea una `LeadNote` con el texto recibido (DTO
    validado, no vacío) y el `personId` de la sesión autenticada como autor.
    Devuelve la nota creada.
  - `GET :leadId/notes` — lista las notas del lead ordenadas por fecha
    descendente (más reciente primero), cada una con su autor.
  - `POST :leadId/contacted` — marca `contactedAt = now()`.
  - `POST :leadId/uncontacted` (o parámetro equivalente) — pone `contactedAt`
    en `null`, para permitir corregir una marca accidental.
  - `POST :leadId/opt-out` — transición manual `* → OPTED_OUT` con
    `optedOutAt = now()`, equivalente humano del opt-out por palabra clave ya
    existente en el bot (misma semántica: no se le vuelve a escribir).
  - `PATCH :leadId/assignment` — setea o limpia `assignedUserId` (debe
    resolver a un `Person` del mismo `tenantId`, si no existe o es de otro
    tenant, 400) y/o `nextActionAt` en el mismo request.
- **Backend — `GET :leadId` existente** se extiende para incluir en la
  respuesta los nuevos campos (`contactedAt`, `assignedUserId`,
  `nextActionAt`) además de los que ya devuelve desde A.3.
- **Frontend — reemplazo de `LeadDetailPage.tsx`** (hoy placeholder) por la
  ficha real, que:
  - Al entrar, invoca en paralelo la ficha consolidada (`GET :leadId`) y el
    timeline de mensajes (`GET :leadId/messages`), y muestra estado de carga
    y de error reutilizando lo de A.2, igual que A.3.
  - Muestra el timeline completo de la conversación (mensajes entrantes y
    salientes, con su `direction`, contenido y fecha), en orden cronológico.
  - Muestra los datos consolidados del lead ya expuestos desde A.3 (teléfono,
    nombre, estado, filtros capturados) más los nuevos: si está contactado
    (`contactedAt`), a quién está asignado (`assignedUserId`, resuelto a
    nombre/email de la persona si el frontend tiene ese dato disponible o al
    menos el identificador) y `nextActionAt`.
  - Tiene un formulario para agregar una nota (texto libre, no vacío) que
    invoca `POST :leadId/notes` y, al confirmar, la nueva nota aparece en una
    lista de notas anteriores (autor + fecha) sin recargar toda la página.
  - Tiene un control (botón/checkbox) para marcar/desmarcar "contactado" que
    invoca `POST :leadId/contacted` / `.../uncontacted` y refleja el nuevo
    estado inmediatamente.
  - Tiene un control para asignar el lead a una persona del tenant y/o
    setear `nextActionAt`, invocando `PATCH :leadId/assignment`. (La fuente
    de personas del tenant para el selector puede reusar un endpoint ya
    existente de `A1`/`people`; si no existe uno de listado simple, el
    `planner` debe agregarlo como parte de A.4, no asumirlo resuelto.)
  - Si el lead está en `HUMAN_HANDOFF`, muestra un botón "liberar handoff"
    que invoca el `POST :leadId/release` ya existente (A.3) y refleja el
    cambio de estado sin recargar la página completa.
  - Tiene una acción de "suprimir lead" (Ley 25.326) que invoca el
    `DELETE :leadId` ya existente, pide confirmación explícita antes de
    ejecutar (acción destructiva e irreversible), y tras confirmar navega de
    vuelta a la bandeja.
  - Tiene una acción de "dar de baja" (opt-out manual) que invoca
    `POST :leadId/opt-out` y refleja el nuevo estado del lead.
  - Toda la UI (textos, botones, mensajes de error/confirmación) en español.

## Fuera de alcance

- Selector genérico de `ConversationState` que permita mover el lead a
  cualquier estado interno de la FSM (`GREETING`, `SEARCH_MATCH`,
  `SCHEDULING` manual sin pasar por el flujo real). Solo se exponen las
  transiciones puntuales descritas arriba (release, opt-out manual).
- Edición o borrado de una `LeadNote` ya creada (solo alta y lectura en A.4).
- Resolución visual rica de `assignedUserId` a avatar/foto de la persona; con
  mostrar su nombre/email alcanza.
- Cola de "llamar hoy" priorizada, su UI y su lógica de orden (Fase B.3): A.4
  solo crea los campos `assignedUserId`/`nextActionAt` y permite editarlos
  desde la ficha individual, no una vista agregada de todos los leads con
  `nextActionAt` vencido.
- Cualquier acción sobre `Appointment` (agendar, confirmar, reprogramar):
  Fase B.
- Notificaciones o recordatorios automáticos basados en `nextActionAt`
  (Fase B.4/D): A.4 solo persiste el dato.
- Dashboard de métricas (A.5).
- Adjuntar archivos o imágenes a una nota: la nota es texto plano.

## Criterios de aceptación (EARS)

**AC-1.** WHEN una persona con sesión válida abre la ficha de un lead de su
propio tenant THE SYSTEM SHALL invocar la ficha consolidada del lead y su
timeline de mensajes, y mostrar ambos una vez recibidos.

**AC-2.** WHILE cualquiera de las dos llamadas de la ficha (datos del lead,
mensajes) está en curso THE SYSTEM SHALL mostrar un estado de carga
distinguible.

**AC-3.** IF alguna de las llamadas de la ficha falla (red o error del
backend) THEN THE SYSTEM SHALL mostrar un mensaje de error legible en
español, sin mostrar una ficha vacía indistinguible de "lead sin datos".

**AC-4.** WHEN el timeline de mensajes de un lead se muestra en la ficha THE
SYSTEM SHALL mostrarlo en orden cronológico ascendente, distinguiendo
visualmente los mensajes entrantes de los salientes.

**AC-5.** WHEN una persona con sesión válida envía `POST
:leadId/notes` con un texto no vacío para un lead de su propio tenant THE
SYSTEM SHALL crear una `LeadNote` asociada a ese lead con el `personId` de la
sesión como autor y la fecha actual, y devolverla.

**AC-6.** IF se envía `POST :leadId/notes` con un texto vacío o ausente THEN
THE SYSTEM SHALL rechazar la petición (400) sin crear ninguna nota.

**AC-7.** WHEN una persona agrega una nota desde la ficha del lead THE
SYSTEM SHALL mostrar esa nota en la lista de notas del lead (con su autor y
fecha) sin requerir recargar toda la página.

**AC-8.** WHEN una persona con sesión válida invoca `GET
:leadId/notes` para un lead de su propio tenant THE SYSTEM SHALL devolver
todas las notas de ese lead ordenadas por fecha de creación descendente.

**AC-9.** WHEN una persona con sesión válida invoca `POST
:leadId/contacted` para un lead de su propio tenant THE SYSTEM SHALL
establecer `contactedAt` a la fecha/hora actual y devolver el lead
actualizado.

**AC-10.** WHEN una persona con sesión válida invoca `POST
:leadId/uncontacted` para un lead previamente marcado como contactado THE
SYSTEM SHALL limpiar `contactedAt` (`null`) y devolver el lead actualizado.

**AC-11.** WHEN una persona marca o desmarca "contactado" desde la ficha THE
SYSTEM SHALL reflejar el nuevo estado visible en la pantalla sin requerir
recargar toda la página.

**AC-12.** WHEN una persona con sesión válida invoca `PATCH
:leadId/assignment` indicando un `assignedUserId` que corresponde a una
`Person` del mismo tenant THE SYSTEM SHALL actualizar el `assignedUserId`
del lead y devolverlo actualizado.

**AC-13.** IF se invoca `PATCH :leadId/assignment` con un `assignedUserId`
que no existe o pertenece a otro tenant THEN THE SYSTEM SHALL rechazar la
petición (400) sin modificar el lead.

**AC-14.** WHEN una persona con sesión válida invoca `PATCH
:leadId/assignment` indicando `nextActionAt` THE SYSTEM SHALL actualizar ese
campo del lead con la fecha/hora recibida y devolverlo actualizado.

**AC-15.** WHEN un lead está en estado `HUMAN_HANDOFF` y una persona con
sesión válida hace click en "liberar handoff" desde la ficha THE SYSTEM
SHALL invocar `POST :leadId/release`, y tras la respuesta exitosa reflejar
en pantalla que el lead ya no está en `HUMAN_HANDOFF`.

**AC-16.** WHEN una persona con sesión válida invoca `POST :leadId/opt-out`
para un lead que no está ya en `OPTED_OUT` THE SYSTEM SHALL establecer
`state = OPTED_OUT` y `optedOutAt` a la fecha/hora actual.

**AC-17.** IF se invoca `POST :leadId/opt-out` para un lead que ya está en
`OPTED_OUT` THEN THE SYSTEM SHALL responder sin error pero sin duplicar
efectos (operación idempotente: no cambia `optedOutAt` a un valor distinto
del ya existente).

**AC-18.** WHEN una persona con sesión válida confirma la supresión de un
lead desde la ficha THE SYSTEM SHALL invocar `DELETE :leadId` (ya existente)
y, tras la respuesta exitosa, navegar de vuelta a la bandeja de leads.

**AC-19.** WHILE no se haya confirmado explícitamente la acción de suprimir
un lead THE SYSTEM SHALL NOT invocar el borrado del lead (requiere paso de
confirmación intermedio antes de ejecutar una acción destructiva).

**AC-20.** WHEN `GET :leadId` (ficha consolidada) se invoca para un lead de
su propio tenant THE SYSTEM SHALL incluir en la respuesta `contactedAt`,
`assignedUserId` y `nextActionAt` junto con los campos ya expuestos desde
A.3.

**AC-21.** IF cualquiera de los endpoints nuevos de esta spec
(`notes`, `contacted`, `uncontacted`, `assignment`, `opt-out`) se invoca con
un `leadId` que no existe o pertenece a un `tenantId` distinto del indicado
en la URL THEN THE SYSTEM SHALL responder 404 sin exponer ni modificar datos
de ese lead.

**AC-22.** WHEN una persona con sesión válida de un tenant A invoca
cualquiera de los endpoints nuevos de esta spec con el `:tenantId` de un
tenant B THE SYSTEM SHALL rechazar la petición (403) sin devolver ni
modificar datos de leads de B, preservando el aislamiento multi-tenant ya
vigente.

**AC-23.** THE SYSTEM SHALL renderizar toda la ficha del lead (timeline,
notas, controles de contactado/asignación/liberar handoff/opt-out/suprimir,
mensajes de error y confirmación) en español.

**AC-24.** THE SYSTEM SHALL NOT exponer en la ficha del lead ni en sus
endpoints ningún control que permita fijar `ConversationState` a un valor
arbitrario: las únicas transiciones manuales de estado disponibles son
liberar handoff (`HUMAN_HANDOFF → QUALIFICATION`, endpoint existente) y
opt-out manual (`* → OPTED_OUT`, endpoint nuevo de esta spec).
