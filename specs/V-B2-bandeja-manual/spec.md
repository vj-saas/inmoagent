# Spec V-B2: Bandeja de leads — toma manual de la conversación

## Contexto

Hoy el asesor humano solo puede *reaccionar* a la conversación del bot: puede
dejar notas (`LeadNote`), marcar "contactado", asignarse un lead, forzar
opt-out, o liberar un `HUMAN_HANDOFF` vencido (`POST :leadId/release`, que hoy
siempre vuelve el lead a `QUALIFICATION`, hardcodeado en
`AdminLeadsController.release`). No existe ningún camino para que una persona
escriba texto libre al lead desde el dashboard: `MessagingService.sendText`
solo lo invoca el `ConversationEngine` (bot). `LeadDetailPage` ya muestra el
timeline de mensajes (`MessageTimeline`) distinguiendo únicamente `IN`/`OUT`
por color (dos estilos, no tres), sin ningún control de "modo" del lead.

Esta spec agrega la capacidad de que un asesor tome la conversación por
completo (envía texto real por WhatsApp, el bot se calla) y la devuelva al
agente de IA cuando corresponda, sin que ambos (bot y humano) puedan
responder al mismo lead a la vez ni se pisen los mensajes.

Depende de la Fase B (design system) ya completada: usa `Button`, `Card`,
`Badge`, `Toast`, `Modal` de `frontend/src/components/ui/`, ya existentes.

### Decisiones de modelado (resueltas en esta spec)

**1. "Modo manual" = reusar `ConversationState.HUMAN_HANDOFF`, sin agregar `assistantEnabled`.**

El plan de producto ofrece dos alternativas: un campo booleano nuevo o
reusar `HUMAN_HANDOFF`. Se elige reusar `HUMAN_HANDOFF` porque:
- El gating "mientras el lead está en modo manual, el bot no le responde" ya
  existe hoy, completo, en `GuardrailsService.evaluate` (rama
  `lead.state === HUMAN_HANDOFF` → `{ type: 'silenced' }`) y en
  `ConversationEngine.handleTurn` (si `guardrailOutcome.stop`, corta ANTES de
  invocar al LLM/handlers de la FSM). Un booleano nuevo (`assistantEnabled`)
  desacoplado del `state` obligaría a re-implementar ese gating en dos
  lugares y abriría la posibilidad de un lead con `state=QUALIFICATION` pero
  `assistantEnabled=false` (o viceversa), un estado inconsistente que hoy no
  puede existir.
- El mensaje entrante SIEMPRE se persiste antes de llegar al guardrail (se
  guarda en `InboundProcessor`/webhook antes de encolar el turno), así que
  "solo persiste mensajes entrantes" ya se cumple sin cambios de código en
  esa ruta.
- Entrar a modo manual por decisión del asesor (sin que el lead haya pedido
  "hablar con una persona") es una extensión legítima del mismo estado: el
  significado de `HUMAN_HANDOFF` pasa a ser "un humano tiene el control de
  esta conversación", ya sea porque el lead lo pidió (guardrail existente,
  sin cambios) o porque el asesor lo tomó proactivamente (esta spec).
- Consecuencia: **no hay migración de Prisma para el "modo"**. El toggle de
  UI ("Agente IA activo" / "Respondiendo vos") se deriva de
  `lead.state === 'HUMAN_HANDOFF'` (manual) vs. cualquier otro estado
  distinto de `OPTED_OUT` (IA). `OPTED_OUT` es un tercer caso ya existente
  (nadie escribe) y se muestra distinto en UI (ver Alcance frontend).

**2. Nuevo campo `Message.sentByPersonId` para distinguir bot vs. humano en mensajes `OUT` (SÍ requiere migración).**

Hoy `Message` solo tiene `direction` (`IN`/`OUT`), insuficiente para 3
estilos de burbuja (lead / bot / humano) — un `OUT` de bot y uno de un
asesor son indistinguibles. Se agrega `sentByPersonId String?` (FK a
`Person`, `onDelete: SetNull`), mismo patrón que `LeadNote.authorPersonId` /
`Appointment.assignedUserId`:
- `direction = IN` → siempre `sentByPersonId = null` (burbuja "lead").
- `direction = OUT` y `sentByPersonId = null` → burbuja "bot" (comportamiento
  actual, sin cambios: `OutboundProcessor.sendAndPersist` sigue creando el
  `Message` sin este campo cuando el envío lo dispara el `ConversationEngine`).
- `direction = OUT` y `sentByPersonId` seteado → burbuja "humano".
- No se agrega un enum `sentBy` (`bot`/`human`) separado porque sería
  redundante con la presencia/ausencia de `sentByPersonId` y agregaría una
  segunda fuente de verdad que podría desincronizarse (ej. `sentBy: human`
  con `sentByPersonId: null`). Un solo campo nullable basta.

**3. `POST /admin/tenants/:tenantId/leads/:leadId/send` requiere sesión de persona, no alcanza con API key.**

El plan pide persistir "el `userId` del asesor que lo mandó" — ese dato no
existe si el request se autenticó por `X-Api-Key` (server-to-server, sin
persona). A diferencia de `createNote` (donde `authorPersonId` es opcional y
puede ser `null` con API key, porque una nota anónima igual tiene sentido),
un mensaje "manual" sin autor conocido no lo tiene: se mostraría como si
fuera del bot en la UI (`sentByPersonId = null`), que es exactamente el bug
que esta spec busca evitar. Por eso este endpoint puntual exige
`PersonSessionGuard` efectivo (rama de sesión de `PersonOrApiKeyGuard`): si
el request llega autenticado solo por API key, se rechaza (403) en vez de
persistir un mensaje humano sin autor.

**4. Ventana de servicio de 24hs: se calcula sobre el último `Message` con `direction = IN`, NUNCA sobre `Lead.lastMessageAt`.**

Hallazgo importante revisando el código: `Lead.lastMessageAt` **no** refleja
solo el último mensaje entrante. Se actualiza en dos lugares:
`LeadsService.findOrCreateByPhone` (invocado por el webhook en cada mensaje
`IN`) y también por `OutboundProcessor.sendAndPersist` (que llama al mismo
`findOrCreateByPhone` al persistir un `Message` **OUT**, sea del bot o —tras
esta spec— de un humano). Usar `lead.lastMessageAt` para medir la ventana de
Meta sería incorrecto: cada mensaje saliente "renovaría" artificialmente la
ventana aunque el lead no haya escrito nada en días. Por eso el chequeo de
24hs de esta spec consulta explícitamente
`Message.findFirst({ where: { tenantId, leadId, direction: IN }, orderBy: { createdAt: 'desc' } })`
y compara su `createdAt` contra `now()`. Esto es lógica **nueva**, no reusa
`lastMessageAt`. (Se deja fuera de alcance corregir la semántica de
`Lead.lastMessageAt` en sí — es un problema preexistente que excede esta
spec y no bloquea sus criterios de aceptación).

**5. `POST :leadId/release` deja de hardcodear `QUALIFICATION`: resuelve el estado de retorno según el contexto del lead.**

Regla determinística, evaluada en este orden (usa los mismos datos que ya
consulta `QualificationHandler`/`filters.util.ts`, sin nueva lógica de
negocio inventada):
1. Si `lead.lastSearchIds.length > 0` (ya se le mostraron propiedades
   concretas en algún momento) → vuelve a `SEARCH_MATCH`.
2. Si no, pero `lead.fOperation` está seteado (ya arrancó la calificación)
   → vuelve a `QUALIFICATION`.
3. Si no tiene ni `fOperation` ni `lastSearchIds` (handoff tomado muy
   temprano, ej. en `GREETING` o apenas iniciado) → vuelve a
   `QUALIFICATION` igual (nunca vuelve a `GREETING`: el saludo con aviso
   Ley 25.326 ya se mandó una vez, marcado por `greetedAt`, y no se repite).
   `QUALIFICATION` es el estado seguro por defecto porque todos sus handlers
   toleran filtros vacíos (empiezan preguntando lo que falte).
- Este mismo cálculo aplica sea que el `release` lo dispare el timeout de
  48hs (comportamiento ya existente, sin cambios de resultado neto salvo que
  ahora puede resolver a `SEARCH_MATCH` en vez de forzar `QUALIFICATION`) o
  el botón "Devolver al agente IA" de esta spec.

**6. Clasificación de criticidad.**

Esta spec toca superficie marcada como **crítica** en `CLAUDE.md`
("Guardrails del LLM y la FSM", "que el LLM nunca sea fuente de verdad",
"handoff a humano"), específicamente:
- La resolución de estado de `release` (decisión 5): si el cálculo fuera
  incorrecto, un lead podría "revivir" en un estado de la FSM que no
  corresponde a sus filtros reales.
- Que `send` entre en modo manual (`HUMAN_HANDOFF`) de forma atómica y
  consistente con el gating existente de guardrails — cualquier grieta acá
  es exactamente el escenario que `CLAUDE.md` prohíbe (bot y humano
  respondiendo al mismo lead a la vez).
- El respeto de `OPTED_OUT` en `send` (regla de negocio innegociable #6).

Lo que **no** es crítico en esta spec (clasificable `medium`/`high` normal):
CRUD del endpoint `send`/`release` en sí, la migración de `sentByPersonId`
(schema change → `high` por definición de `CLAUDE.md`, no crítico), y todo
el frontend (visual, sin lógica de negocio propia — consume los endpoints).

## Alcance

### Backend

- **Migración de schema**: agregar `Message.sentByPersonId` (`String?`, FK a
  `Person`, `onDelete: SetNull`).
- `POST /admin/tenants/:tenantId/leads/:leadId/send`, mismo patrón de guards
  que el resto de `AdminLeadsController` pero exige sesión de persona
  (rechaza API key pura — ver decisión 3). Body: `{ text: string }`
  (no vacío, trimmed, con `class-validator`).
  - Si el lead está `OPTED_OUT` → rechaza, no llama a `MessagingService`.
  - Si pasaron ≥ 24hs desde el último `Message` `direction=IN` de ese lead
    (o nunca hubo uno) → rechaza, no llama a `MessagingService`.
  - Si pasa ambas validaciones: envía el texto vía
    `MessagingService.sendText` (mismo cliente que usa el bot), y — a
    diferencia del flujo bot, donde `OutboundProcessor` persiste el
    `Message` tras confirmar el envío — este endpoint pone el lead en
    `HUMAN_HANDOFF` (`handoffAt = now`, si no lo estaba ya) de forma
    atómica junto con la persistencia del `Message` OUT con
    `sentByPersonId` = id de la persona autenticada, evitando la ventana de
    carrera donde el bot podría procesar un turno concurrente antes de que
    el modo manual quede activo. (Detalle de implementación —transacción,
    o reservar el modo antes de encolar el envío— queda para el `planner`;
    el requisito no negociable es que no exista una ventana donde el bot
    pueda responder después de que un humano ya decidió tomar la
    conversación.)
- `POST /admin/tenants/:tenantId/leads/:leadId/release`: se mantiene el
  endpoint existente, pero deja de hardcodear `QUALIFICATION` — aplica la
  regla de la decisión 5. Sin cambios en su guard actual (no requiere
  persona; puede seguir usándose vía API key, igual que hoy).
- Ningún cambio en `GuardrailsService` ni en `ConversationEngine`: el
  gating de "bot no responde en `HUMAN_HANDOFF`" ya existe y se reusa tal
  cual.

### Frontend

- `MessageTimeline`: tres estilos de burbuja diferenciados (lead / bot /
  humano) derivados de `direction` + `sentByPersonId`, mismo orden
  cronológico ya existente, transcripciones de audio ya visibles (sin
  cambios ahí).
- Toggle/indicador siempre visible en `LeadDetailPage` del modo actual
  (`state === 'HUMAN_HANDOFF'` → "Respondiendo vos"; `OPTED_OUT` → estado de
  baja, sin acciones de envío; cualquier otro estado → "Agente IA activo"),
  usando `Badge` del design system.
- Caja de texto para enviar mensaje manual (usa `send`). Al primer envío
  exitoso sobre un lead que NO estaba en `HUMAN_HANDOFF`: `Toast` de
  confirmación + cambio de color del header del chat reflejando el nuevo
  modo (releyendo el lead actualizado, mismo patrón que `fetchLead` en
  `ReleaseHandoffButton`).
- Botón "Devolver al agente IA" (extiende el `ReleaseHandoffButton`
  existente, o uno nuevo con la misma lógica): visible cuando
  `state === 'HUMAN_HANDOFF'`, con `Modal` de confirmación antes de
  ejecutar.
- Indicador de ventana de 24hs junto a la caja de envío: calculado a partir
  de un timestamp que el backend debe exponer (último mensaje `IN`; se dejan
  al `planner` los detalles de qué endpoint lo expone — puede ir en la
  respuesta de `GET :leadId` o `GET :leadId/messages`). Si ya expiró, la caja
  de texto se deshabilita con el mensaje explicativo del rechazo del
  backend en vez de esperar al 400.
- `LeadsPage`/`LeadsList`: `Badge` por lead mostrando modo IA/manual, mismo
  criterio de derivación que el toggle de `LeadDetailPage`.

## Fuera de alcance

- Cualquier plantilla (template) de WhatsApp para reabrir la ventana de
  24hs vencida: el endpoint solo rechaza y explica, no ofrece un camino
  alternativo de envío por template en esta spec.
- Corregir la semántica de `Lead.lastMessageAt` (que hoy se pisa con
  mensajes salientes) — se documenta como hallazgo (decisión 4) pero no se
  toca en esta spec, que usa una consulta propia sobre `Message`.
- Adjuntar imágenes/documentos desde el envío manual (solo texto libre,
  igual que pide el plan de producto).
- Reasignación de `sentByPersonId` después de creado el `Message`.
- Deshacer/editar un mensaje manual ya enviado.
- Cambios en el guardrail de handoff explícito por palabra clave del lead
  (`HANDOFF_PATTERNS`) ni en el timeout de 48hs en sí — solo se corrige a
  qué estado libera (decisión 5), no cuándo dispara.
- Notificaciones push/tiempo real al asesor de que el lead volvió a
  escribir mientras está en modo manual (ya cubierto parcialmente por
  `LeadAlertService`, sin cambios acá).

## Criterios de aceptación (EARS)

**Backend**

**AC-1.** WHEN una persona con sesión válida (no API key) invoca `POST
:leadId/send` con `text` no vacío para un lead de su propio tenant que no
está `OPTED_OUT` y cuyo último `Message` `IN` tiene menos de 24hs THE SYSTEM
SHALL enviar el texto vía `MessagingService.sendText`, persistir un `Message`
`OUT` con `sentByPersonId` = id de esa persona, y dejar el lead en
`ConversationState.HUMAN_HANDOFF` con `handoffAt` actualizado.

**AC-2.** [CRÍTICO] IF se invoca `POST :leadId/send` sobre un lead en estado
`OPTED_OUT` THEN THE SYSTEM SHALL rechazar la petición sin invocar
`MessagingService` ni persistir ningún `Message`.

**AC-3.** IF se invoca `POST :leadId/send` y el lead nunca tuvo un `Message`
`direction=IN`, o el más reciente tiene 24hs o más de antigüedad, THEN THE
SYSTEM SHALL rechazar la petición con un mensaje que indique que hace falta
un template aprobado, sin invocar `MessagingService` ni persistir el
`Message`.

**AC-4.** IF se invoca `POST :leadId/send` con `text` vacío o ausente THEN
THE SYSTEM SHALL rechazar la petición (400) sin efectos secundarios.

**AC-5.** IF se invoca `POST :leadId/send` autenticado únicamente con API key
de tenant (sin sesión de persona) THEN THE SYSTEM SHALL rechazar la petición
(403) sin enviar ni persistir nada.

**AC-6.** [CRÍTICO] WHILE un lead está en `ConversationState.HUMAN_HANDOFF`
THE SYSTEM SHALL NOT invocar al LLM ni a los handlers de la FSM para los
mensajes entrantes de ese lead (comportamiento ya vigente vía
`GuardrailsService`/`ConversationEngine`, verificado con un test explícito
que cubra también el caso donde `HUMAN_HANDOFF` fue producido por `send`,
no solo por pedido explícito del lead).

**AC-7.** [CRÍTICO] WHEN un lead entra en modo manual mediante `POST
:leadId/send` mientras el `ConversationEngine` está procesando (o a punto de
procesar) un turno concurrente de ese mismo lead THE SYSTEM SHALL garantizar
que el bot no envíe una respuesta después de que el modo manual quedó
activo (sin ventana de carrera bot-humano respondiendo a la vez).

**AC-8.** [CRÍTICO] WHEN se invoca `POST :leadId/release` sobre un lead en
`HUMAN_HANDOFF` cuyo `lastSearchIds` no está vacío THE SYSTEM SHALL
transicionarlo a `ConversationState.SEARCH_MATCH` (no `QUALIFICATION`) y
limpiar `handoffAt`.

**AC-9.** WHEN se invoca `POST :leadId/release` sobre un lead en
`HUMAN_HANDOFF` con `lastSearchIds` vacío THE SYSTEM SHALL transicionarlo a
`ConversationState.QUALIFICATION` y limpiar `handoffAt`, sin importar si
`fOperation` está seteado o no.

**AC-10.** WHEN un lead fue liberado mediante `POST :leadId/release` THE
SYSTEM SHALL procesar el siguiente mensaje entrante de ese lead a través del
`ConversationEngine` (dispara la FSM/LLM normalmente).

**AC-11.** IF se invoca `POST :leadId/release` sobre un lead que no está en
`HUMAN_HANDOFF` THEN THE SYSTEM SHALL rechazar la petición sin modificar el
lead (comportamiento ya existente, preservado).

**AC-12.** THE SYSTEM SHALL persistir todo `Message` enviado por un asesor
humano con el mismo modelo `Message` que usa el bot (misma tabla, mismos
campos de `direction`/`type`/`body`), distinguible únicamente por
`sentByPersonId` no nulo.

**AC-13.** IF cualquiera de `send`/`release` se invoca con un `leadId` que
no existe o pertenece a un `tenantId` distinto del indicado en la URL THEN
THE SYSTEM SHALL responder 404 sin exponer ni modificar datos de ese lead.

**Frontend**

**AC-14.** WHEN se renderiza el timeline de mensajes de un lead THE SYSTEM
SHALL mostrar cada mensaje con uno de tres estilos visuales distintos según
corresponda a lead (`direction=IN`), bot (`direction=OUT`,
`sentByPersonId=null`) o humano (`direction=OUT`, `sentByPersonId` no nulo),
en orden cronológico ascendente, con la transcripción visible para mensajes
de audio.

**AC-15.** THE SYSTEM SHALL mostrar en `LeadDetailPage`, en todo momento
mientras la ficha está abierta, un indicador siempre visible del modo actual
del lead (IA activa / respondiendo un humano / opt-out), sin requerir
ninguna acción del usuario para verlo.

**AC-16.** WHEN un asesor envía el primer mensaje manual sobre un lead que
no estaba en modo manual THE SYSTEM SHALL, tras la confirmación del backend,
mostrar un toast de confirmación y cambiar el color/estado visual del header
del chat para reflejar el nuevo modo.

**AC-17.** WHEN un asesor hace click en "Devolver al agente IA" THE SYSTEM
SHALL mostrar un diálogo de confirmación antes de ejecutar la liberación, y
solo invocar `release` si el asesor confirma explícitamente.

**AC-18.** WHILE quedan menos de 24hs de ventana de servicio para un lead
THE SYSTEM SHALL mostrar al asesor cuánto tiempo resta antes de que se
bloquee el envío de texto libre.

**AC-19.** WHEN la ventana de 24hs ya venció para un lead THE SYSTEM SHALL
deshabilitar la caja de envío de texto con un mensaje explicativo, sin
esperar a que el asesor intente enviar y reciba el rechazo del backend.

**AC-20.** WHEN se renderiza `LeadsPage` THE SYSTEM SHALL mostrar, por cada
lead listado, un badge que indique si está en modo IA o en modo manual, con
el mismo criterio de derivación de estado que `LeadDetailPage`.
