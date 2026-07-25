# Tasks V-B2: Bandeja de leads — toma manual de la conversación

> Producido por `task-splitter`. Tareas atómicas derivadas de `plan.md` (y de
> las 9 decisiones de "Aprobaciones pendientes", todas aprobadas salvo el
> punto 9 — hallazgo de `InboundProcessor.respondUnsupported`, fuera de
> alcance, follow-up separado, no aparece en ningún task de este documento).
> Vive en `specs/V-B2-bandeja-manual/tasks.md`.

> Nota de clasificación (CLAUDE.md "Qué es low/medium/high" + "Qué se
> considera crítico"): la migración Prisma es **high** por definición
> explícita ("migraciones Prisma / cambios de schema"), no crítica — mismo
> criterio que B1/T1. Todo lo que toque `pipeline` (lock de debounce),
> `conversation` (FSM/guardrails, `resolveReleaseState`, `resolveGuardrail`)
> o colas BullMQ (`messaging`, job de `OutboundProcessor`) es **high** por
> regla explícita del CLAUDE.md de este proyecto, y además **crítico** en
> esta spec porque implementa exactamente los AC marcados [CRÍTICO] en
> `spec.md` (AC-2, AC-6, AC-7, AC-8) más AC-9 (mismo mecanismo de
> `resolveReleaseState` que AC-8, y la spec ya lo agrupa junto a AC-8 en su
> propia sección "Clasificación de criticidad"). El CRUD/DTOs de `admin`
> (controller, DTOs, guard marcador, wiring de módulo) queda en **medium**
> porque reusa `findLeadOrThrow`/patrones ya vigentes en `AdminLeadsController`
> sin introducir resolución de tenant nueva — mismo criterio que B1/T2-T9.
> El e2e de flujo completo (`T22`) queda en **high** porque es la única
> superficie que ejercita punta a punta los cinco AC críticos a la vez
> (mismo criterio que B1/T10: "ante la duda, el nivel más alto para la
> superficie crítica"). El frontend es **medium** en su totalidad —la spec
> lo marca explícitamente "visual, sin lógica de negocio propia" (spec.md,
> decisión 6)— salvo que ninguna tarea de frontend toque `conversation`,
> `pipeline`, `webhook` ni resolución de tenant, por lo que no aplica `high`.

## Tareas

## T1 — Migración Prisma: `Message.sentByPersonId` + relación `Person` + índice
- **Dificultad:** high ← migración de schema Prisma, clasificación explícita del CLAUDE.md, no crítica
- **Descripción:** Agregar a `Message`: `sentByPersonId String?` +
  `sentByPerson Person? @relation("MessageSender", fields: [sentByPersonId],
  references: [id], onDelete: SetNull)` + `@@index([sentByPersonId])`.
  Agregar relación inversa `Person.sentMessages Message[]
  @relation("MessageSender")`. Correr
  `npx prisma migrate dev --name add_message_sent_by_person`. Sin backfill:
  columna nullable, `null` ya significa "bot" para el 100% de las filas
  existentes. Verificar que Prisma Client regenerado tipa los campos nuevos
  y que `onDelete: SetNull` (nunca `Cascade`) queda en la migración generada.
- **Valida:** prerrequisito estructural de AC-1, AC-12, AC-14 (ningún AC de
  negocio se valida directamente acá; se verifica por `npx prisma validate` +
  build limpio + que los specs de T8/T9/T22 compilen contra el schema nuevo).
- **Dependencias:** ninguna
- **Paralelizable:** sí (con el resto del Grupo 1)

## T2 — `service-window.util.ts`: ventana de servicio de 24hs (función pura)
- **Dificultad:** medium ← util puro en `admin/leads`, sin resolución de tenant, sin tocar FSM/pipeline
- **Descripción:** Crear `src/admin/leads/service-window.util.ts` con
  `SERVICE_WINDOW_MS` (24hs, constante, NO env var), `isServiceWindowOpen
  (lastInboundAt: Date | null, now: Date): boolean` (`false` si `null`, `false`
  si `now - lastInboundAt >= SERVICE_WINDOW_MS`, borde `>=` cerrado) y
  `SERVICE_WINDOW_CLOSED_MESSAGE` (copy en español que menciona el template
  aprobado, AC-3). Incluye `service-window.util.spec.ts`: `null` → cerrada;
  23h59m → abierta; exactamente 24hs → cerrada; 25hs → cerrada.
- **Valida:** AC-3 vía `service-window.util.spec.ts` (unit) — la integración
  end-to-end la cubren T8 y T22.
- **Dependencias:** ninguna
- **Paralelizable:** sí

## T3 — `release-state.util.ts`: `resolveReleaseState` (función pura de FSM)
- **Dificultad:** high ← vive en `conversation/`, es una regla de la FSM (a qué estado es válido volver); CRÍTICO: AC-8 y AC-9 lo marcan explícitamente
- **Descripción:** Crear `src/conversation/release-state.util.ts` con
  `resolveReleaseState(lead: Pick<Lead, 'lastSearchIds'>): ConversationState`
  — función libre, sin `@Injectable`, sin dependencias. Regla binaria:
  `lastSearchIds.length > 0 ? SEARCH_MATCH : QUALIFICATION` (nunca
  `GREETING`, nunca `HUMAN_HANDOFF`/`OPTED_OUT`). Comentario en el código
  explicando por qué la rama de `fOperation` de la decisión 5 de la spec
  colapsa en el mismo resultado y no se implementa por separado. Incluye
  `release-state.util.spec.ts`: `lastSearchIds` con items → `SEARCH_MATCH`;
  vacío con y sin `fOperation` seteado → `QUALIFICATION` en ambos casos;
  nunca devuelve `GREETING`/`HUMAN_HANDOFF`/`OPTED_OUT`.
- **Valida:** AC-8 [CRÍTICO], AC-9 [CRÍTICO] vía `release-state.util.spec.ts`
  (unit) — se integra en T10 (endpoint) y T11 (timeout) y se ejercita end-to-end
  en T22.
- **Dependencias:** ninguna
- **Paralelizable:** sí

## T4 — `PersonSessionRequiredGuard`: guard marcador a nivel método
- **Dificultad:** medium ← ~10 líneas sin dependencias, no re-autentica, no toca `PersonOrApiKeyGuard` compartido ni resuelve tenant
- **Descripción:** Crear `src/admin/guards/person-session-required.guard.ts`:
  si `request.person` no existe (rama API key de `PersonOrApiKeyGuard`, que
  corre antes por ser guard de clase) → `ForbiddenException('Este endpoint
  requiere una sesión de persona')` (403). Si existe → pasa. Se aplica
  SOLO al endpoint `send` (método), sin tocar los otros 12 endpoints de
  `AdminLeadsController`. Incluye `person-session-required.guard.spec.ts`:
  sin `person` → throw; con `person` → pasa; request con `X-Api-Key` **y**
  `Authorization: Bearer` a la vez → 403 (comportamiento fijado por la
  precedencia existente del guard compuesto).
- **Valida:** AC-5 vía `person-session-required.guard.spec.ts` (unit) —
  integración HTTP en T9, e2e en T22.
- **Dependencias:** ninguna
- **Paralelizable:** sí

## T5 — `DebounceBufferService.withLeadLock`: exponer el lock de lead
- **Dificultad:** high ← toca `pipeline`, regla explícita del CLAUDE.md; CRÍTICO: es el mecanismo que cierra AC-7
- **Descripción:** Agregar `withLeadLock<T>(tenantId, leadId, fn: () =>
  Promise<T>): Promise<T | null>` a `DebounceBufferService`, reusando el MISMO
  par privado `acquireLock`/`releaseLock` y la MISMA key
  (`debounce:lock:<tenantId>:<leadId>`) que ya usa `tryFlush`. Devuelve
  `null` sin ejecutar `fn` si no pudo tomar el lock. Libera el lock siempre,
  incluso si `fn` lanza (try/finally). Sin cambios en `push`/`tryFlush`/
  `purgeLead`. Incluye/extiende `debounce-buffer.service.spec.ts`:
  `withLeadLock` usa la misma key que `tryFlush`; devuelve `null` si está
  tomado; libera el lock siempre (incluso si el callback lanza); dos llamadas
  concurrentes → solo una ejecuta `fn`.
- **Valida:** AC-7 [CRÍTICO] vía `debounce-buffer.service.spec.ts` (unit) —
  integración en T8, e2e en T22.
- **Dependencias:** ninguna
- **Paralelizable:** sí

## T6 — `messaging`: `messageId` opcional en el job de texto + `sendAndPersist` por `update`
- **Dificultad:** high ← toca colas BullMQ (`messaging`), regla explícita del CLAUDE.md; CRÍTICO-adyacente: evita la doble persistencia que rompería AC-7/AC-12
- **Descripción:** `src/messaging/messaging.types.ts`: la variante `text` de
  `OutboundJobData` acepta `messageId?: string`. `src/messaging/
  messaging.service.ts`: `sendText(tenant, to, body, opts?: { messageId?:
  string })` — opcional, el bot lo sigue llamando igual que hoy sin `opts`.
  `src/messaging/outbound.processor.ts`: `sendAndPersist` recibe el
  `messageId` opcional; si viene, `message.updateMany({ where: { id:
  messageId, tenantId }, data: { waMessageId } })` en vez de `create` (no
  invoca `findOrCreateByPhone`); si no viene, comportamiento actual intacto.
  Extiende `outbound.processor.spec.ts`: job con `messageId` → `update` del
  `waMessageId` sin `create` y sin `findOrCreateByPhone`; sin `messageId` →
  comportamiento actual intacto.
- **Valida:** AC-7 [CRÍTICO], AC-12 vía `outbound.processor.spec.ts` (unit) —
  integración en T8, e2e en T22 (exactamente un `Message` OUT tras un `send`).
- **Dependencias:** ninguna
- **Paralelizable:** sí

## T7 — `SendManualMessageDto`
- **Dificultad:** medium ← DTO con `class-validator`, patrón estándar del CLAUDE.md
- **Descripción:** Crear `src/admin/leads/dto/send-manual-message.dto.ts`:
  `text: string` con `@IsString() @Transform(({ value }) =>
  typeof value === 'string' ? value.trim() : value) @IsNotEmpty()
  @MaxLength(4096)` (alineado al límite de body de texto de WhatsApp).
- **Valida:** AC-4 vía `test/admin-lead-manual-reply.e2e-spec.ts` (una vez
  wireado en T9); validación aislada también cubrible con unit test de
  `class-validator` si el implementer lo prefiere.
- **Dependencias:** ninguna
- **Paralelizable:** sí

## T8 — `AdminLeadMessagingService.sendManual`: orquestador crítico de `send`
- **Dificultad:** high ← concentra lock + transacción + envío sobre `HUMAN_HANDOFF`/opt-out; CRÍTICO: AC-2, AC-7 explícitos en spec.md, más AC-1/AC-3/AC-12
- **Descripción:** Crear `src/admin/leads/admin-lead-messaging.service.ts` con
  `sendManual(tenantId, leadId, personId, text)` y el helper privado
  `findLastInboundAt(tenantId, leadId)`. Orden exacto (ver plan.md, sección
  "Flujo de `POST :leadId/send`"): (1) `findLeadOrThrow` → 404; (2) si
  `lead.state === OPTED_OUT` → 409 sin tocar nada (AC-2); (3)
  `findLastInboundAt` + `isServiceWindowOpen` (T2) → 409 con
  `SERVICE_WINDOW_CLOSED_MESSAGE` si está cerrada, ANTES de la tx (AC-3);
  (4) `debounceBuffer.withLeadLock` (T5) — si devuelve `null` → 409
  "el asistente está terminando de responder, reintentá en unos segundos"
  (AC-7); dentro del lock: (4a) `$transaction` con
  `lead.updateMany({ where: { id, tenantId, state: { not: OPTED_OUT } },
  data: { state: HUMAN_HANDOFF, handoffAt: now } })` (si `count === 0` →
  rollback + 409, opt-out concurrente) + `message.create({ direction: OUT,
  type: TEXT, body: text, sentByPersonId: personId, tenantId, leadId })`;
  (4b) post-commit, aún dentro del lock: `messaging.sendText(tenant,
  lead.phone, text, { messageId })` (T6) — si el encolado falla, `delete`
  compensatorio del `Message` + 502. Incluye
  `admin-lead-messaging.service.spec.ts` (Prisma, Messaging y
  DebounceBuffer mockeados): AC-2 opt-out → throw sin `message.create` ni
  `sendText`; AC-3 sin IN o IN viejo → throw sin side effects; AC-7 lock
  `null` → 409 sin `sendText`; AC-1/AC-12 happy path con orden `withLeadLock`
  → `$transaction` → `sendText` (assertear que `sendText` corre DESPUÉS del
  commit y con el `messageId`); `updateMany` con 0 filas (opt-out
  concurrente) → rollback + 409; fallo del encolado → `delete` compensatorio.
- **Valida:** AC-1, AC-2 [CRÍTICO], AC-3, AC-7 [CRÍTICO], AC-12 vía
  `admin-lead-messaging.service.spec.ts` (unit) — end-to-end en T22.
- **Dependencias:** T1, T2, T5, T6
- **Paralelizable:** no (integra los cuatro; conviene un solo implementer para evitar mocks desalineados)

## T9 — `POST :leadId/send`: controller + wiring de módulo + exposición de `lastInboundAt`/`sentByPerson`
- **Dificultad:** medium ← endpoint nuevo bajo controller existente, mismo patrón `findLeadOrThrow`, sin resolución de tenant nueva
- **Descripción:** En `AdminLeadsController`, agregar `POST :leadId/send`
  con guards de clase existentes (`TenantThrottlerGuard`,
  `PersonOrApiKeyGuard`) + `@UseGuards(PersonSessionRequiredGuard)` (T4) a
  nivel método, `SendManualMessageDto` (T7) como body, `req.person.id` como
  `personId` (tipo `AuthenticatedPersonRequest` ya existente, sin volver a la
  DB), delega en `AdminLeadMessagingService.sendManual` (T8). Modificar
  `getOne` y `messages` para exponer `lastInboundAt` (campo derivado
  aditivo: `{ ...lead, lastInboundAt }`, vía `findLastInboundAt` en `getOne`
  y derivado del array ya cargado —último `direction=IN`— en `messages`,
  usando un helper `withLastInboundAt(lead, value)` para forma idéntica en
  ambos); `messages` agrega `include: { sentByPerson: { select: { id: true,
  email: true } } }` (AC-14). Registrar `AdminLeadMessagingService` y
  `PersonSessionRequiredGuard` en `providers` de `AdminModule`, agregar
  `MessagingModule` y `TenantsModule` a `imports` (hoy solo `PipelineModule`,
  `AuthModule`).
- **Valida:** AC-1, AC-4, AC-5, AC-13, AC-14 (exposición del campo) vía
  `test/admin-lead-manual-reply.e2e-spec.ts` (cablea T7/T8/T4 a HTTP).
- **Dependencias:** T4, T7, T8
- **Paralelizable:** no (integra las tareas anteriores en un solo controller)

## T10 — `AdminLeadsService.release()`: mover lógica del controller + `resolveReleaseState`
- **Dificultad:** high ← resuelve el estado de retorno de la FSM tras un handoff; CRÍTICO: AC-8, AC-9 explícitos en spec.md, más AC-11
- **Descripción:** Mover la lógica de `release` del controller (hoy inline en
  `AdminLeadsController.release`, hardcodea `QUALIFICATION`) a
  `AdminLeadsService.release(tenantId, leadId)`: `findLeadOrThrow` (404) →
  `nextState = resolveReleaseState(lead)` (T3) →
  `lead.updateMany({ where: { id, tenantId, state: HUMAN_HANDOFF },
  data: { state: nextState, handoffAt: null } })` (atómico, evita el TOCTOU
  entre `findLeadOrThrow` y `update`, mismo criterio que `optOut`) → si
  `count === 0` → 400 'El lead no está en HUMAN_HANDOFF' (comportamiento
  actual preservado, AC-11). Se preservan status 200, body
  `{ released: true }` y el guard actual del endpoint (sigue admitiendo API
  key: no persiste autoría de nadie).
- **Valida:** AC-8 [CRÍTICO], AC-9 [CRÍTICO], AC-11 vía
  `test/admin-lead-manual-reply.e2e-spec.ts` (T22); unit de la resolución en
  sí ya cubierto por T3.
- **Dependencias:** T3
- **Paralelizable:** sí (con T11)

## T11 — `ConversationEngine.resolveGuardrail`: cambio quirúrgico para `handoff_timeout_release`
- **Dificultad:** high ← toca `conversation` (FSM/guardrails), regla explícita del CLAUDE.md; CRÍTICO: mismo mecanismo de AC-8/AC-9 aplicado al timeout de 48hs
- **Descripción:** `ConversationEngine.resolveGuardrail(tenant, action)` pasa
  a recibir el `lead` y, en la rama `handoff_timeout_release`, usa
  `resolveReleaseState(lead)` (T3) en vez del `QUALIFICATION` hardcodeado.
  Único cambio en el motor: no toca el gating de guardrails, ni el orden de
  evaluación, ni el flujo de envío del bot. Extiende el spec del motor
  (`conversation.engine.spec.ts`): un `handoff_timeout_release` sobre un
  lead con `lastSearchIds` no vacío deja `SEARCH_MATCH` (antes forzaba
  `QUALIFICATION`); con `lastSearchIds` vacío sigue en `QUALIFICATION`.
- **Valida:** AC-8 [CRÍTICO] (vía el timeout, camino distinto al de T10) vía
  `conversation.engine.spec.ts` (unit).
- **Dependencias:** T3
- **Paralelizable:** sí (con T10)

## T12 — Extensión de `GuardrailsService`: test explícito de `HUMAN_HANDOFF` originado por `send`
- **Dificultad:** high ← extiende tests sobre `conversation`/guardrails, regla explícita del CLAUDE.md; CRÍTICO: AC-6 explícito en spec.md
- **Descripción:** Sin cambios de código en `GuardrailsService` (el gating ya
  existe y se reusa tal cual). Extender
  `guardrails.service.spec.ts`: un lead en `HUMAN_HANDOFF` con `handoffAt`
  reciente puesto por `sendManual` (T8) y texto entrante sin ninguna frase
  de handoff → tipo `silenced`; con `handoffAt` de más de 48hs → tipo
  `handoff_timeout_release`. Extender el spec del motor
  (`conversation.engine.spec.ts`): con `silenced` no se invoca el
  `LlmProvider` mockeado ni los handlers de la FSM. Documenta explícitamente
  que el AC no distingue "el lead pidió hablar con un humano" de "el asesor
  tomó la conversación" — el mismo estado cubre ambos orígenes.
- **Valida:** AC-6 [CRÍTICO — explícito en spec.md] vía
  `guardrails.service.spec.ts` y `conversation.engine.spec.ts` (unit) — e2e
  de regresión en T22 (verifica que no se encola nada tras un `send`).
- **Dependencias:** T8, T11
- **Paralelizable:** no (necesita el `HUMAN_HANDOFF` producido por T8 y el
  camino de timeout de T11 como fixtures del test)

## T13 — `frontend/src/api/endpoints.ts`: tipos + `sendManualMessage`
- **Dificultad:** medium ← cambio de contrato de API en frontend, sin lógica de negocio propia
- **Descripción:** `Message` +`sentByPersonId: string | null` +`sentByPerson:
  { id: string; email: string } | null`; `Lead` +`lastInboundAt: string |
  null`; nueva función `sendManualMessage(tenantId, leadId, text, token)`
  (`POST .../send`). Extiende `api/endpoints.test.ts`: `sendManualMessage`
  arma el POST correcto con el body de texto y el token.
- **Valida:** contrato consumido por T15/T17/T18/T20/T21; test propio en
  `api/endpoints.test.ts`.
- **Dependencias:** T9 (el contrato HTTP debe estar cerrado)
- **Paralelizable:** sí (con T22)

## T14 — `LeadModeBadge.tsx`: `resolveLeadMode` + componente
- **Dificultad:** medium ← componente visual + función pura de derivación, sin lógica de negocio propia (spec.md, decisión 6)
- **Descripción:** Crear `frontend/src/components/leads/LeadModeBadge.tsx`
  exportando `resolveLeadMode(state): 'MANUAL' | 'OPTED_OUT' | 'AI'` (puro:
  `'MANUAL'` si `state === 'HUMAN_HANDOFF'`, `'OPTED_OUT'` si `state ===
  'OPTED_OUT'`, `'AI'` en cualquier otro caso — orden explícito, sin
  enumerar los estados de la FSM) + `<LeadModeBadge>` usando `Badge` del
  design system (`warning` manual / `danger` opt-out / `success` IA).
  Incluye `LeadModeBadge.test.tsx`: los tres modos y el default de IA para
  un estado desconocido.
- **Valida:** AC-15, AC-20 (criterio único de derivación) vía
  `LeadModeBadge.test.tsx` — consumido por T18/T20/T21.
- **Dependencias:** ninguna (usa `Lead.state`, ya existente)
- **Paralelizable:** sí

## T15 — `MessageTimeline.tsx`: tres tonos (lead / bot / humano)
- **Dificultad:** medium ← componente visual, deriva tono en el render sin estado
- **Descripción:** `tone = direction === 'IN' ? 'incoming' : (sentByPersonId
  ? 'human' : 'bot')`, expuesto en `data-tone` (reemplaza el actual
  `data-tone="outgoing"` binario). Conserva `data-direction`, orden
  cronológico y la lógica de `transcription` para audios sin cambios.
  Rótulo con el email del autor (`sentByPerson.email`) en las burbujas
  humanas (AC-14). Alineación: `incoming` a la izquierda; `bot`/`human` a la
  derecha con paletas distintas. Actualiza `MessageTimeline.test.tsx` (hoy
  asserta `data-tone="outgoing"`) para los tres `data-tone`.
- **Valida:** AC-14 vía `MessageTimeline.test.tsx`.
- **Dependencias:** T13 (necesita `sentByPersonId`/`sentByPerson` en el tipo `Message`)
- **Paralelizable:** sí (con T16, T19)

## T16 — `ManualReplyBox.tsx`: caja de envío con indicador de ventana
- **Dificultad:** medium ← componente visual con `setInterval` local, sin lógica de negocio propia; el 409 del backend sigue siendo la autoridad final
- **Descripción:** Crear `frontend/src/components/leads/ManualReplyBox.tsx`:
  textarea + `Button`, recibe `lead` (con `lastInboundAt`), muestra el
  remanente formateado ("quedan 3 h 12 m", AC-18) con `setInterval` de 60s,
  deshabilitado con copy explicativo si venció o si `resolveLeadMode(lead)
  === 'OPTED_OUT'` (AC-19), llama a `sendManualMessage` (T13), `showToast` +
  `onSent()` al éxito (AC-16). Ante error (incluido el 409 de ventana
  vencida por reloj desfasado) NO limpia el textarea. Incluye
  `ManualReplyBox.test.tsx`: toast + `onSent` al éxito; texto del
  remanente; deshabilitado con copy si venció o si `OPTED_OUT`; texto vacío
  no habilita el envío; textarea preservado ante error.
- **Valida:** AC-16, AC-18, AC-19 vía `ManualReplyBox.test.tsx`.
- **Dependencias:** T13, T14 (usa `resolveLeadMode`)
- **Paralelizable:** sí (con T15, T19)

## T17 — `ReleaseHandoffButton.tsx`: extender con `Modal` de confirmación
- **Dificultad:** medium ← extiende un componente existente, mantiene su guard actual, sin lógica de negocio propia
- **Descripción:** Cambiar el label a "Devolver al agente IA", agregar
  estado local `confirmOpen` + `<Modal>` con Cancelar/Confirmar;
  `releaseLead` (endpoint ya existente, sin cambios de contrato) se invoca
  SOLO desde el botón Confirmar. Mantiene el guard actual (`lead.state !==
  'HUMAN_HANDOFF'` devuelve `null`). Actualiza `ReleaseHandoffButton.test.tsx`:
  no llama a `releaseLead` hasta confirmar en el `Modal`; cancelar no
  dispara nada.
- **Valida:** AC-17 vía `ReleaseHandoffButton.test.tsx`.
- **Dependencias:** ninguna (el endpoint `release` ya existe; su contenido
  de respuesta no cambia, solo el estado que devuelve internamente T10)
- **Paralelizable:** sí (con T15, T16)

## T18 — `LeadDetailPage.tsx`: wiring de badge, header por modo y `ManualReplyBox`
- **Dificultad:** medium ← wiring de componentes ya construidos en una página existente
- **Descripción:** `LeadModeBadge` (T14) en el header de la card de mensajes
  (color de header derivado de `resolveLeadMode`), `ManualReplyBox` (T16)
  bajo el timeline; `onSent` refetchea lead + mensajes (`fetchLead()` +
  `messagesApi.run(...)`, mismo patrón que `ReleaseHandoffButton.onReleased`)
  para que el header cambie de color tras el primer envío (AC-16). Actualiza
  `LeadDetailPage.test.tsx`: badge presente, header con color por modo,
  `ManualReplyBox` cableado, `ReleaseHandoffButton` (T17) visible cuando
  corresponde.
- **Valida:** AC-15, AC-16 vía `LeadDetailPage.test.tsx`.
- **Dependencias:** T14, T15, T16, T17
- **Paralelizable:** no (integra los cuatro en una sola página)

## T19 — `LeadRow.tsx`: badge por lead en `LeadsPage`
- **Dificultad:** medium ← wiring de un componente ya construido en una fila de tabla existente
- **Descripción:** `<LeadModeBadge>` (T14) por fila, usando el MISMO
  `resolveLeadMode` que `LeadDetailPage` (garantiza "mismo criterio", AC-20).
  Actualiza `LeadRow.test.tsx`: badge presente con los tres modos posibles.
- **Valida:** AC-20 vía `LeadRow.test.tsx`.
- **Dependencias:** T14
- **Paralelizable:** sí (con T15, T16, T17)

## T20 — e2e: `test/admin-lead-manual-reply.e2e-spec.ts`
- **Dificultad:** high ← única superficie que ejercita punta a punta los cinco AC críticos de la spec (AC-2, AC-6, AC-7, AC-8, AC-9) a la vez; mismo criterio que B1/T10
- **Descripción:** Flujo completo con sesión de persona real (login →
  token), siguiendo el patrón de `admin-lead-management.e2e-spec.ts` y
  `debounce.e2e-spec.ts`: (1) `send` con sesión válida y un `Message` IN
  reciente → 200; en DB lead en `HUMAN_HANDOFF` con `handoffAt` seteado,
  exactamente **un** `Message` OUT con `sentByPersonId` = persona logueada
  (AC-1, AC-12) y un job encolado en `outbound` con el `messageId`; (2)
  `send` con `X-Api-Key` de tenant → 403 y 0 mensajes nuevos (AC-5); (3)
  `send` con texto en blanco y sin body → 400 (AC-4); (4) `send` sobre lead
  `OPTED_OUT` → 409, 0 `Message`, 0 jobs (AC-2 [CRÍTICO]); (5) `send` sobre
  un lead sin ningún IN y sobre un lead con IN de 25hs → 409 con el copy del
  template, 0 side effects (AC-3); (6) `send` y `release` con `leadId` de
  otro tenant → 404 (AC-13); (7) `release` con `lastSearchIds` no vacío →
  `SEARCH_MATCH` y `handoffAt` null (AC-8 [CRÍTICO]); con `lastSearchIds`
  vacío → `QUALIFICATION` (AC-9 [CRÍTICO]); sobre un lead que no está en
  `HUMAN_HANDOFF` → 400 sin cambios (AC-11); (8) tras `release`, un webhook
  entrante del lead vuelve a pasar por el `ConversationEngine` (AC-10),
  reusando `conversation-engine.e2e-spec.ts`; (9) regresión: `send` sobre un
  lead en `HUMAN_HANDOFF` (por pedido explícito o por `send` previo) no
  encola ningún job de bot ni invoca al LLM mockeado (AC-6 [CRÍTICO]); (10)
  regresión de `GET :leadId` y `GET :leadId/messages`: traen `lastInboundAt`
  coherente entre sí y el resto del contrato intacto (AC-14 backend).
- **Valida:** AC-1, AC-2 [CRÍTICO], AC-3, AC-4, AC-5, AC-6 [CRÍTICO], AC-8
  [CRÍTICO], AC-9 [CRÍTICO], AC-10, AC-11, AC-12, AC-13 vía
  `test/admin-lead-manual-reply.e2e-spec.ts`.
- **Dependencias:** T9, T10, T12
- **Paralelizable:** sí (con el frontend de T13 en adelante; no con nada del backend crítico que aún esté sin cerrar)

## Orden de ejecución sugerido

> Lo usa `task-router` para despachar.

- **Grupo 1 (paralelo, sin deps):** T1, T2, T3, T4, T5, T6, T7, T14, T17
- **Grupo 2 (paralelo, depende de Grupo 1):** T8, T10, T11, T19
  (T8 depende de T1/T2/T5/T6; T10 y T11 dependen de T3; T19 depende de T14)
- **Grupo 3 (paralelo, depende de Grupo 2):** T9, T12
  (T9 depende de T4/T7/T8; T12 depende de T8/T11)
- **Grupo 4 (paralelo, depende de Grupo 3):** T13, T20
  (T13 depende de T9; T20 —e2e— depende de T9/T10/T12)
- **Grupo 5 (paralelo, depende de Grupo 4):** T15, T16
  (ambos dependen de T13; T16 además de T14)
- **Grupo 6 (depende de Grupo 5):** T18
  (integra T14, T15, T16, T17)

## Cobertura de criterios

- AC-1 → T8, T9, T20 ✓
- AC-2 [CRÍTICO] → T8, T20 ✓
- AC-3 → T2, T8, T20 ✓
- AC-4 → T7, T9, T20 ✓
- AC-5 → T4, T9, T20 ✓
- AC-6 [CRÍTICO] → T12, T20 ✓
- AC-7 [CRÍTICO] → T5, T6, T8 ✓
- AC-8 [CRÍTICO] → T3, T10, T11, T20 ✓
- AC-9 [CRÍTICO] → T3, T10, T20 ✓
- AC-10 → T10, T20 ✓
- AC-11 → T10, T20 ✓
- AC-12 → T6, T8, T20 ✓
- AC-13 → T9, T20 ✓
- AC-14 → T9, T15 ✓
- AC-15 → T14, T18 ✓
- AC-16 → T16, T18 ✓
- AC-17 → T17 ✓
- AC-18 → T16 ✓
- AC-19 → T16 ✓
- AC-20 → T14, T19 ✓

Sin huecos: los 20 AC de la spec tienen al menos una tarea que los valida.
Fuera de este documento por decisión explícita del disparador: el punto 9 de
"Aprobaciones pendientes" del plan (hallazgo de
`InboundProcessor.respondUnsupported` respondiendo en `HUMAN_HANDOFF`/
`OPTED_OUT`) no forma parte del alcance de esta fase y no tiene tarea
asociada — queda documentado en el plan como candidato a spec follow-up.
