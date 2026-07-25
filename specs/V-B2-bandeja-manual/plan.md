# Plan V-B2: Bandeja de leads — toma manual de la conversación

> Producido por planner. Define CÓMO se construye lo que la spec V-B2 pide.
> Las decisiones de modelado ya están resueltas y aprobadas en la spec
> (reusar `HUMAN_HANDOFF` en vez de `assistantEnabled`, `Message.sentByPersonId`,
> `send` solo con sesión de persona, ventana de 24hs sobre `Message` IN,
> `release` con estado resuelto). Este plan NO las re-discute: define su
> implementación.
> Superficie **crítica** (guardrails/handoff, regla 6 de opt-out) + una
> migración Prisma (**high**). El frontend es `medium` (visual, sin lógica de
> negocio propia).

## Arquitectura

Tres frentes acoplados por el contrato HTTP de
`/admin/tenants/:tenantId/leads/:leadId/{send,release,messages}`:

- **DB / Prisma (high):** una migración aditiva y nullable: `Message.sentByPersonId`
  (FK a `Person`, `onDelete: SetNull`) + relación inversa en `Person` + índice
  sobre la columna FK. Nada de backfill: todos los `Message` existentes quedan
  con `null` = "bot" (que es exactamente su semántica actual).

- **Backend (crítico en el gating, medium en el CRUD):** se agrega un service
  nuevo `AdminLeadMessagingService` (en `src/admin/leads/`) que concentra el
  envío manual, y se mueve la lógica de `release` del controller al
  `AdminLeadsService` (hoy está inline en `AdminLeadsController.release`) para
  que el cálculo del estado de retorno sea testeable en unit. El gating de
  "bot callado en `HUMAN_HANDOFF`" NO se toca: se reusa `GuardrailsService`
  tal cual. El único cambio en `ConversationEngine` es reemplazar el
  `QUALIFICATION` hardcodeado del `handoff_timeout_release` por la misma
  función pura de resolución de estado (decisión 5 de la spec).

- **Frontend (medium):** un componente de derivación de modo
  (`LeadModeBadge` + helper puro `resolveLeadMode`) reusado por
  `LeadDetailPage` y `LeadRow` (garantiza "mismo criterio", AC-20), una caja
  de envío (`ManualReplyBox`) con indicador de ventana, `MessageTimeline` con
  tres tonos y `ReleaseHandoffButton` con `Modal` de confirmación.

### Flujo de `POST :leadId/send` (el punto crítico, AC-7)

```
controller (guards de clase: TenantThrottlerGuard, PersonOrApiKeyGuard
            + guard de método: PersonSessionRequiredGuard)
  └─ AdminLeadMessagingService.sendManual(tenantId, leadId, personId, text)
       1. findLeadOrThrow(tenantId, leadId)                    -> 404 (AC-13)
       2. si lead.state === OPTED_OUT                          -> 409, corta (AC-2)
       3. lastInboundAt = Message.findFirst({direction: IN})
          si !lastInboundAt || now - lastInboundAt >= 24hs      -> 409, corta (AC-3)
       4. debounceBuffer.withLeadLock(tenantId, leadId, fn)
          si el lock está tomado (turno del bot en vuelo)      -> 409 "reintentá" (AC-7)
          dentro del lock:
            4.a $transaction:
                 - lead.updateMany({ id, tenantId, state: { not: OPTED_OUT } },
                                   { state: HUMAN_HANDOFF, handoffAt: now })
                   si count === 0 -> opt-out concurrente: rollback + 409
                 - message.create({ direction: OUT, type: TEXT, body: text,
                                    sentByPersonId, tenantId, leadId })
            4.b (post-commit, aún dentro del lock)
                 messaging.sendText(tenant, lead.phone, text, { messageId })
                 si el encolado falla -> delete compensatorio del Message + 502
       5. devuelve { message, lead } ya actualizados
```

El invariante que cierra AC-7 es el **lock de lead de Redis que ya usa el
debounce**: `InboundProcessor` corre `ConversationEngine.handleTurn` COMPLETO
dentro de `debounceBuffer.tryFlush` (lock `debounce:lock:<tenantId>:<leadId>`,
TTL 60s). Ver "Decisiones técnicas → Atomicidad".

### Flujo de `POST :leadId/release`

```
controller -> AdminLeadsService.release(tenantId, leadId)
  findLeadOrThrow (404)
  nextState = resolveReleaseState(lead)         # función pura, testeable
  lead.updateMany({ id, tenantId, state: HUMAN_HANDOFF },
                  { state: nextState, handoffAt: null })
  si count === 0 -> 400 'El lead no está en HUMAN_HANDOFF' (AC-11, preservado)
  devuelve { released: true }                   # contrato actual intacto
```

## Entidades / módulos afectados

### DB (`prisma/schema.prisma`) — migración

- **model Message (modifica):** +`sentByPersonId String?`, +`sentByPerson Person?
  @relation("MessageSender", ..., onDelete: SetNull)`, +`@@index([sentByPersonId])`.
- **model Person (modifica):** +relación inversa `sentMessages Message[] @relation("MessageSender")`.
- Migración: `npx prisma migrate dev --name add_message_sent_by_person`
  → `prisma/migrations/<timestamp>_add_message_sent_by_person/migration.sql`
  (convención `add_<cosa>` de las 11 migraciones existentes).

### Backend

- `src/admin/leads/admin-lead-messaging.service.ts` (**nuevo**): `sendManual()`
  + helper privado `findLastInboundAt()`. Único lugar que orquesta lock +
  transacción + envío.
- `src/admin/leads/service-window.util.ts` (**nuevo**): `SERVICE_WINDOW_MS`
  (24hs) + `isServiceWindowOpen(lastInboundAt: Date | null, now: Date): boolean`
  (puro) + `SERVICE_WINDOW_CLOSED_MESSAGE` (copy en español, AC-3).
- `src/conversation/release-state.util.ts` (**nuevo**): `resolveReleaseState(lead)`
  puro, compartido por el endpoint `release` y el timeout de 48hs.
- `src/admin/guards/person-session-required.guard.ts` (**nuevo**): guard marcador
  a nivel método; exige `request.person` ya adjunta → si no, 403 (AC-5).
- `src/admin/leads/dto/send-manual-message.dto.ts` (**nuevo**): `text: string`
  con `@IsString() @Transform(trim) @IsNotEmpty() @MaxLength(4096)` (AC-4).
- `src/admin/leads/admin-leads.service.ts` (**modifica**): +`release()`,
  +`findLastInboundAt()`, +`getLeadWithWindow()` (lead + `lastInboundAt`).
- `src/admin/leads/admin-leads.controller.ts` (**modifica**): +`POST :leadId/send`;
  `release` delega en el service (deja de hardcodear `QUALIFICATION`);
  `getOne` y `messages` exponen `lastInboundAt` y `sentByPerson`.
- `src/admin/admin.module.ts` (**modifica**): registra `AdminLeadMessagingService`
  y `PersonSessionRequiredGuard` en `providers`; agrega `MessagingModule` y
  `TenantsModule` a `imports` (hoy solo `PipelineModule`, `AuthModule`).
- `src/pipeline/debounce-buffer.service.ts` (**modifica, high**): expone
  `withLeadLock<T>(tenantId, leadId, fn): Promise<T | null>` — mismo par
  `acquireLock`/`releaseLock` privado que ya usa `tryFlush`, MISMA key.
  Devuelve `null` si no pudo tomar el lock (el caller decide el 409). Sin
  cambios en `push`/`tryFlush`/`purgeLead`.
- `src/messaging/messaging.types.ts` (**modifica**): la variante `text` de
  `OutboundJobData` acepta `messageId?: string`.
- `src/messaging/messaging.service.ts` (**modifica**): `sendText(tenant, to, body,
  opts?: { messageId?: string })` — opcional; el bot lo llama igual que hoy.
- `src/messaging/outbound.processor.ts` (**modifica**): `sendAndPersist` recibe
  el `messageId` opcional; si viene, **actualiza** ese `Message` con el
  `waMessageId` que devolvió Meta en vez de crear uno nuevo (evita duplicar la
  burbuja); si no viene, comportamiento actual intacto.

### Frontend

- `frontend/src/api/endpoints.ts` (**modifica**): `Message` +`sentByPersonId: string | null`
  +`sentByPerson: { id: string; email: string } | null`; `Lead` +`lastInboundAt: string | null`;
  +`sendManualMessage(tenantId, leadId, text, token)`.
- `frontend/src/components/leads/MessageTimeline.tsx` (**modifica**): tres tonos
  (`data-tone="incoming" | "bot" | "human"`), rótulo con el email del autor en
  las burbujas humanas (AC-14). Su `.test.tsx` se actualiza (hoy asserta
  `data-tone="outgoing"`).
- `frontend/src/components/leads/LeadModeBadge.tsx` (**nuevo**): exporta
  `resolveLeadMode(state): 'MANUAL' | 'OPTED_OUT' | 'AI'` (puro) + `<LeadModeBadge>`
  con `Badge` (`warning` manual / `danger` opt-out / `success` IA). Único criterio
  de derivación del proyecto (AC-15, AC-20).
- `frontend/src/components/leads/ManualReplyBox.tsx` (**nuevo**): textarea +
  `Button`, indicador de ventana con `setInterval` de 60s, deshabilitado si
  venció o si `mode === 'OPTED_OUT'` (AC-18, AC-19), `showToast` + `onSent()` al
  éxito (AC-16).
- `frontend/src/components/leads/ReleaseHandoffButton.tsx` (**modifica**): label
  "Devolver al agente IA" + `Modal` de confirmación (AC-17).
- `frontend/src/routes/LeadDetailPage.tsx` (**modifica**): `LeadModeBadge` en el
  header de la card de mensajes (con color de header por modo), `ManualReplyBox`
  bajo el timeline; `onSent` refetchea lead + mensajes (`fetchLead` +
  `messagesApi.run`).
- `frontend/src/components/leads/LeadRow.tsx` (**modifica**): `<LeadModeBadge>`
  por fila (AC-20).

### Sin cambios (explícito)

- `src/conversation/guardrails/guardrails.service.ts` — el gating
  `HUMAN_HANDOFF` → `silenced` se reusa TAL CUAL (AC-6). Solo se agregan tests.
- `src/webhook/*`, `src/pipeline/inbound.processor.ts` — la persistencia del
  `Message` IN ya ocurre antes del guardrail; no hace falta tocar nada.
- `src/conversation/conversation.engine.ts` — un solo cambio quirúrgico
  (`resolveGuardrail` recibe el `lead` y usa `resolveReleaseState` en el
  `handoff_timeout_release`). Nada del gating ni del flujo de envío.
- `Lead.lastMessageAt` — su semántica sucia queda documentada (decisión 4 de la
  spec) y no se corrige acá.

## Migración Prisma (diff conceptual)

```prisma
model Message {
  // ... campos existentes ...
  sentByPersonId String?                                       // NUEVO
  sentByPerson   Person? @relation("MessageSender", fields: [sentByPersonId], references: [id], onDelete: SetNull) // NUEVO

  createdAt DateTime @default(now())

  @@index([tenantId, leadId, createdAt])
  @@index([sentByPersonId])                                    // NUEVO
}

model Person {
  // ... campos existentes ...
  sentMessages Message[] @relation("MessageSender")            // NUEVO
}
```

Decisiones de la migración:

- **`String?` nullable, sin default y sin backfill.** `null` ya significa "bot"
  (decisión 2 de la spec), que es la semántica correcta para el 100% de las filas
  existentes: todas las creó `OutboundProcessor` a pedido del
  `ConversationEngine`. `ALTER TABLE ADD COLUMN` nullable en Postgres no
  reescribe la tabla.
- **`onDelete: SetNull` + nombre de relación `"MessageSender"`.** Mismo patrón que
  `LeadNote.authorPersonId` y `Appointment.assignedUserId`. Borrar una `Person`
  NUNCA puede borrar historial de conversación con el lead (el `Message` es
  evidencia de lo que se le dijo, con trazabilidad de Ley 25.326 detrás): el
  mensaje sobrevive y pasa a mostrarse como bot. Nombre explícito porque
  `Person` ya tiene 4 relaciones y Prisma necesita desambiguar. NUNCA `Cascade`.
- **`@@index([sentByPersonId])` — SÍ hace falta.** No por queries de esta spec
  (ningún endpoint filtra por autor), sino por el `SetNull`: sin un índice con
  `sentByPersonId` como columna líder, cada `DELETE` de una `Person` fuerza un
  seq scan de `messages` (la tabla que más crece del sistema). Costo de
  escritura marginal: la columna es `null` en la enorme mayoría de las filas y un
  B-tree de una sola columna no indexa nulls, así que el índice queda diminuto.
  Alternativa descartada: `@@index([tenantId, sentByPersonId])` — no sirve para el
  `SetNull` (columna líder equivocada) y ninguna query lo pide.
- **NO se agrega índice para la query de la ventana de 24hs.** El
  `@@index([tenantId, leadId, createdAt])` existente ya cubre
  `where { tenantId, leadId }` + `orderBy createdAt desc`; `direction = IN` es un
  predicado residual sobre un scan descendente que corta en la primera fila que
  matchea (en una conversación real hay un IN cada 1-3 mensajes).
- Clasificación: **high** por ser cambio de schema, NO crítico.

## Decisiones técnicas

### Guard: solo-persona en un endpoint puntual, sin tocar el resto del controller

Hoy `AdminLeadsController` resuelve el acceso mixto con
`@UseGuards(TenantThrottlerGuard, PersonOrApiKeyGuard)` **a nivel clase**:
`PersonOrApiKeyGuard` enruta por header (`X-Api-Key` -> `TenantApiKeyGuard`;
`Authorization: Bearer` -> `PersonSessionGuard` + `TenantScopeGuard`) y, solo en
la rama de sesión, deja `request.person` adjunta (`createNote` lo lee como
`req.person?.id ?? null`). Los 12 endpoints actuales dependen de ese OR.

- **Decisión: `PersonSessionRequiredGuard`, guard marcador a nivel método,
  encadenado después del guard de clase.** Nest ejecuta los guards en orden
  global -> controller -> método, así que cuando corre ya está autenticado. Son
  ~10 líneas sin dependencias: si `request.person` no existe, lanza
  `ForbiddenException('Este endpoint requiere una sesión de persona')`. Se agrega
  únicamente en `send`; los otros 12 endpoints no cambian una línea.
  - **Por qué no `@UseGuards(PersonSessionGuard, TenantScopeGuard)` en el
    método:** re-autenticaría (segunda query a `Session`) y, ante un request con
    solo `X-Api-Key`, `PersonSessionGuard` tira **401**, no el **403** que exige
    AC-5. Distinguir "no estás autenticado" de "estás autenticado pero no como
    persona" es literalmente lo que el AC pide y lo que el frontend necesita.
  - **Por qué no un `@RequirePerson()` + `Reflector` dentro de
    `PersonOrApiKeyGuard`:** meter una regla de un endpoint en el guard
    compartido por `leads`, `metrics`, `properties` y `appointments` hace que
    cualquier bug ahí impacte 4 controllers. El guard marcador tiene radio de
    daño de un endpoint.
  - Consecuencia aceptada: si un cliente manda `X-Api-Key` **y**
    `Authorization: Bearer` a la vez, la precedencia existente elige API key,
    `person` queda sin setear y el endpoint responde 403 aunque la sesión sea
    válida. Es consistente con la precedencia ya documentada del guard
    compuesto; el frontend solo manda `Bearer`. Se fija con un test.
- El `personId` llega al service desde `req.person.id` (tipo
  `AuthenticatedPersonRequest` ya existente), sin volver a la DB.

### Atomicidad y ventana de carrera bot-humano (AC-7, el requisito crítico)

- **Una transacción Prisma sobre lead+message NO alcanza.** El
  `ConversationEngine` lee el lead al inicio de `handleTurn`, evalúa guardrails
  con ese snapshot, después llama al LLM (segundos) y recién al final hace
  `sendActions` + `persistLeadUpdate`. Un `send` humano que commitea DESPUÉS de
  esa lectura y ANTES del `sendActions` deja al bot mandando su respuesta con el
  lead ya en `HUMAN_HANDOFF` — y peor: `persistLeadUpdate` escribe
  `state: result.nextState` y **pisaría** el `HUMAN_HANDOFF` recién puesto,
  devolviendo el lead al bot sin que nadie lo pida. La transacción hace atómica
  la escritura, no la exclusión mutua: hace falta algo más.

- **Se reusa el lock de lead de Redis del debounce, exponiendo `withLeadLock` en
  `DebounceBufferService`.** `InboundProcessor` ejecuta `handleTurn` entero
  dentro de `tryFlush`, que sostiene `debounce:lock:<tenantId>:<leadId>`
  (`SET NX PX 60000`) hasta terminar. Si el endpoint toma esa MISMA key:
  - Bot con turno en vuelo -> el endpoint no obtiene el lock y responde **409**
    ("el asistente está terminando de responder, reintentá en unos segundos").
    El asesor reintenta y el segundo intento entra. Nunca dos escritores.
  - Endpoint con el lock -> ningún turno puede arrancar; al liberar, el turno
    pendiente (o el retry que `tryFlush` ya reencola solo cuando choca con el
    lock) relee el lead, ve `HUMAN_HANDOFF` y `GuardrailsService` lo manda a
    `silenced`: el bot no responde y el `Message` IN ya quedó persistido.
  - Es el precedente exacto del proyecto para "un solo actor por lead a la vez"
    y no requiere ningún cambio en el `ConversationEngine`.
  - Alternativas descartadas: (a) **solo** `$transaction` — no cierra la ventana
    (ver arriba); (b) re-chequear el estado del lead dentro del
    `ConversationEngine` antes de cada envío — la cerraría, pero exige tocar el
    motor (la spec lo prohíbe) y no resuelve el `persistLeadUpdate` pisando el
    estado; (c) un lock nuevo con otra key — no da exclusión mutua contra el bot,
    que es todo el punto; (d) purgar el buffer o cancelar el job delayed en el
    `send` — no ayuda con un turno ya en vuelo y perdería mensajes del lead que
    deben quedar visibles; (e) lock optimista por versión en `Lead` — obligaría a
    una columna nueva y a que el motor la respete (otra vez, tocarlo).

- **Dentro del lock, además, `$transaction` + `updateMany` condicionado.** El
  lock protege contra el bot; la transacción protege la consistencia
  lead-message (si el `message.create` falla, el lead no queda en modo manual sin
  mensaje humano) y el `where: { state: { not: OPTED_OUT } }` protege contra un
  opt-out concurrente que NO toma el lock (el `POST :leadId/opt-out` de admin,
  que corre en su propia tx): si afecta 0 filas se aborta con 409 sin persistir
  el `Message` (refuerzo de AC-2 y de la regla 6 de `CLAUDE.md`). Mismo patrón
  `updateMany` condicional que `AdminLeadsService.optOut`.

- **`sendText` se llama DESPUÉS del commit, nunca dentro de la transacción.**
  Encolar en BullMQ dentro de una tx es un side effect no reversible: si hay
  rollback, el mensaje ya salió. Se commitea primero (el lead queda en modo
  manual: estado seguro, bot callado) y después se encola. **Si el encolado
  falla** (Redis caído), se hace un `delete` compensatorio del `Message` recién
  creado y se responde 502, dejando el lead en `HUMAN_HANDOFF`: preferimos "el
  bot se quedó callado de más" antes que "el bot contestó cuando un humano ya
  había tomado la conversación".

- **`handoffAt = now` en CADA `send`, no solo en el primero.** Refresca la
  ventana del timeout de 48hs: sin esto, un asesor conversando durante horas
  podría ver al bot "revivir" por el `handoff_timeout_release` en medio de la
  charla. Satisface AC-1 ("`handoffAt` actualizado") de la forma más segura.

- **`waMessageId` vía `messageId` en el job, no una segunda fila.** El bot
  persiste el `Message` DESPUÉS de que Meta confirma (`OutboundProcessor`); acá
  se persiste ANTES (lo exige AC-7). Para no terminar con dos filas del mismo
  mensaje, el job de texto lleva `messageId` opcional y `sendAndPersist` hace
  `message.updateMany({ where: { id: messageId, tenantId }, data: { waMessageId } })`
  en vez de `create`. Ventajas: una sola burbuja, se conserva el `waMessageId`
  para futuros status updates, y **no** se llama a `findOrCreateByPhone` (que es
  justamente lo que contamina `Lead.lastMessageAt`, decisión 4 de la spec).
  Alternativa descartada: un booleano `skipPersist` en el job — igual de simple
  pero pierde el `waMessageId` del mensaje humano para siempre.
  Riesgo asumido: si el job agota sus 5 intentos, queda un `Message` con
  `waMessageId = null` mostrado como enviado sin haber salido. Se loguea `error`
  con `messageId` y `leadId`; un estado de entrega en `Message` es follow-up (hoy
  no existe ni para el bot).

### Ventana de servicio de 24hs

- **La validación vive en el service (`AdminLeadMessagingService`), nunca en el
  controller.** El controller solo resuelve guards, DTO y `req.person.id`. Así la
  regla se testea en unit sin HTTP y queda reusable si mañana otro camino (ej.
  un envío manual de imagen) necesita el mismo chequeo.
- **Query exacta**, tal cual la fija la decisión 4 de la spec:

```ts
const last = await this.prisma.message.findFirst({
  where: { tenantId, leadId, direction: MessageDirection.IN },
  orderBy: { createdAt: 'desc' },
  select: { createdAt: true },
});
```

  Filtrada por `tenantId` (convención innegociable) aunque `leadId` ya sea único:
  el índice compuesto arranca por `tenantId` y el aislamiento no debe depender de
  una inferencia. NO se usa `Lead.lastMessageAt` (lo pisan los mensajes salientes
  vía `OutboundProcessor` -> `findOrCreateByPhone`).
- **El umbral es una función pura** `isServiceWindowOpen(lastInboundAt, now)` en
  `service-window.util.ts`: verdadero solo si `lastInboundAt` no es null y
  `now - lastInboundAt < SERVICE_WINDOW_MS`. El borde exacto de 24hs queda
  **cerrado** (comparación `>=`): conservador, porque Meta rechazaría el envío y
  no queremos gastar el intento ni dejar un `Message` fantasma. Se exporta
  también el copy del rechazo (menciona que hace falta un template aprobado,
  AC-3) para que backend y test compartan una sola fuente.
- **`SERVICE_WINDOW_MS` es constante, no env var.** Es una regla de Meta, no un
  parámetro del negocio; una env var invitaría a "aflojarla" y el envío fallaría
  igual del lado de Meta.

### Exposición de `lastInboundAt` al frontend

- **Se agrega como campo derivado DENTRO del objeto lead que ya devuelven
  `GET :leadId` y `GET :leadId/messages`**, sin endpoint nuevo:
  `GET :leadId` -> `{ ...lead, lastInboundAt: string | null }`;
  `GET :leadId/messages` -> `{ lead: { ...lead, lastInboundAt }, messages }`.
  Es **aditivo**: agregar una propiedad a un objeto JSON no rompe consumidores
  (el frontend accede por nombre de campo y los tests assertean campos
  puntuales). Un endpoint nuevo (`GET :leadId/service-window`) sumaría un
  round-trip y otro estado de carga en `LeadDetailPage` para un timestamp que
  siempre se necesita junto al lead.
- **En `GET :leadId/messages` se deriva del array ya cargado** (último elemento
  con `direction === 'IN'`), sin query extra: ese endpoint ya trae todos los
  mensajes ordenados. En `GET :leadId` se usa `findLastInboundAt`. Un helper
  `withLastInboundAt(lead, value)` garantiza forma idéntica en ambos. El único
  desvío posible entre los dos caminos es un IN llegado entre ambos requests,
  irrelevante para un contador de 24hs.
- `GET :leadId/messages` agrega `include: { sentByPerson: { select: { id: true,
  email: true } } }` — mismo patrón que `LeadNote.author`, para rotular la burbuja
  humana con el email del asesor (AC-14) sin un fetch extra de personas.

### Resolución del estado en `release`

- **Función pura `resolveReleaseState(lead)` en
  `src/conversation/release-state.util.ts`.** Vive en `conversation/` porque es
  una regla de la FSM (a qué estado es válido volver), no de la API admin, y
  porque sus DOS consumidores están uno en cada lado: `AdminLeadsService.release`
  y el `handoff_timeout_release` de `ConversationEngine.resolveGuardrail`. Es una
  función libre (no `@Injectable`): sin dependencias, se testea sin módulo de
  Nest y se importa desde `admin` sin acoplar DI — igual que `filters.util.ts`,
  util puro del mismo módulo.
  Firma: `resolveReleaseState(lead: Pick<Lead, 'lastSearchIds'>): ConversationState`.
- **La regla se implementa binaria**, deliberadamente:
  `lastSearchIds.length > 0 ? SEARCH_MATCH : QUALIFICATION`. Los pasos 2 y 3 de
  la decisión 5 de la spec colapsan en el mismo resultado (`QUALIFICATION` con y
  sin `fOperation`) y AC-9 lo confirma ("sin importar si `fOperation` está
  seteado"). Un `if (fOperation)` que devuelve lo mismo en las dos ramas sería
  código muerto que sugiere una diferencia inexistente. El comentario del util
  documenta por qué NUNCA se vuelve a `GREETING` (el aviso Ley 25.326 ya se
  mandó, marcado por `greetedAt`) y por qué `QUALIFICATION` es el default seguro
  (sus handlers toleran filtros vacíos).
- **`ConversationEngine.resolveGuardrail(tenant, action)` pasa a recibir el
  `lead`** para llamar al util en la rama `handoff_timeout_release`. Es el único
  cambio en el motor: no toca el gating, ni el orden de guardrails, ni el flujo
  de envío. Alternativa descartada: dejar el timeout en `QUALIFICATION` y aplicar
  la regla solo en el endpoint — dos comportamientos distintos para la misma
  transición "salir de handoff", justo la inconsistencia que la decisión 5
  elimina.
- **`release` se mueve del controller al `AdminLeadsService`** con
  `updateMany({ where: { id, tenantId, state: HUMAN_HANDOFF } })`: hace atómica
  la verificación de estado (evita el TOCTOU entre `findLeadOrThrow` y `update`,
  mismo criterio que `optOut`) y, si afecta 0 filas, relee para distinguir 404 de
  400. Se preservan el status 200, el body `{ released: true }` y su guard actual
  (sigue admitiendo API key: no persiste autoría de nadie).

### Frontend

- **`resolveLeadMode(state)` exportado desde `LeadModeBadge.tsx` y usado por
  `LeadDetailPage`, `LeadRow` y `ManualReplyBox`.** Un único punto de derivación
  garantiza el "mismo criterio" que piden AC-15/AC-20. Devuelve `'MANUAL'` si
  `state === 'HUMAN_HANDOFF'`, `'OPTED_OUT'` si `state === 'OPTED_OUT'`, `'AI'`
  en cualquier otro caso — orden explícito, sin enumerar los estados de la FSM
  (si mañana se agrega uno, cae en `'AI'`, que es lo correcto por defecto).
- **`MessageTimeline`: tres tonos derivados en el render, sin estado.**
  `tone = direction === 'IN' ? 'incoming' : (sentByPersonId ? 'human' : 'bot')`,
  expuesto en `data-tone` (los tests assertean ese atributo, no clases). Se
  conservan `data-direction`, el orden cronológico y la lógica de
  `transcription` para audios (AC-14). Alineación: `incoming` a la izquierda;
  `bot` y `human` a la derecha con paletas distintas (`bg-primary` vs. un tono de
  `success`/`info` del design system) más el rótulo con el email en las humanas.
  El `.test.tsx` existente se actualiza (hoy espera `data-tone="outgoing"`).
- **`ManualReplyBox` es dueño de la deshabilitación (AC-19)**, con el mismo
  umbral de 24hs que el backend. Recibe `lead` (con `lastInboundAt`), muestra el
  remanente formateado ("quedan 3 h 12 m", AC-18) y se deshabilita con copy
  explicativo si venció o si el modo es `OPTED_OUT`. Un `setInterval` de 60s
  recalcula para que una ficha abierta pase sola de "quedan 2 m" a deshabilitada
  sin recargar. El 409 del backend sigue siendo la autoridad final y se muestra
  como `Toast` de `danger` si igual llega (relojes desfasados, mensaje borrado).
- **El primer envío exitoso refetchea lead + mensajes (AC-16).** `onSent()` en
  `LeadDetailPage` corre `fetchLead()` (mismo patrón que
  `ReleaseHandoffButton.onReleased`) y `messagesApi.run(...)`. El cambio de color
  del header sale de que el lead releído ya trae `state === 'HUMAN_HANDOFF'` ->
  `resolveLeadMode` -> clase del header + `LeadModeBadge`; el `Toast` lo dispara
  `ManualReplyBox` con `useToast()` (el `ToastProvider` ya está montado en
  `App.tsx`).
- **`ReleaseHandoffButton` se extiende, no se duplica.** Mantiene su guard
  (`lead.state !== 'HUMAN_HANDOFF'` devuelve `null`), cambia el label a "Devolver
  al agente IA" y agrega estado local `confirmOpen` + `<Modal>` con
  Cancelar/Confirmar; `releaseLead` se invoca SOLO desde el botón Confirmar
  (AC-17). Un componente nuevo duplicaría la lógica de `useApi`/error ya testeada.

## Riesgos y edge cases

- **[TTL del lock vs. request lento]** El lock del debounce tiene TTL de 60s y
  `releaseLock` hace `del` sin token de propiedad. Si el `send` tardara más de
  60s (no debería: dos queries, una tx corta y un `queue.add`), el bot podría
  tomar el lock y el `del` del endpoint borraría un lock ajeno. Mitigación: el
  trabajo dentro del lock es mínimo y no incluye ninguna llamada HTTP a Meta (el
  envío es un `add` a la cola). Un lock con fencing token es follow-up general
  del `DebounceBufferService`, no de esta spec.
- **[409 por lock ocupado visto por el asesor]** Es un rechazo esperado y
  frecuente si el lead acaba de escribir. El copy debe ser accionable ("el
  asistente está terminando de responder, reintentá en unos segundos") y
  `ManualReplyBox` NO debe limpiar el textarea ante error (el asesor perdería el
  texto escrito). Explícito para el implementer.
- **[HALLAZGO — fuga del gating por mensajes no soportados]**
  `InboundProcessor.respondUnsupported` envía `UNSUPPORTED_MESSAGE_RESPONSE`
  ANTES de pasar por `GuardrailsService` y sin tomar el lock: un lead en
  `HUMAN_HANDOFF` (o en `OPTED_OUT`) que manda un sticker recibe respuesta
  automática mientras el humano tiene la conversación. NO viola AC-6 (no invoca
  LLM ni handlers de la FSM) ni AC-7 (no es un turno concurrente al `send`), pero
  es un caso real de "bot y humano hablando a la vez" y roza la regla 6. Fuera
  del alcance de esta spec (toca `pipeline`): se documenta y se recomienda una
  spec follow-up que mueva ese chequeo detrás de los guardrails.
- **[Mensaje persistido sin haber salido]** Si el job outbound agota reintentos,
  la burbuja humana queda visible sin `waMessageId`. Inherente a persistir antes
  de enviar (precio de AC-7). Se loguea `error`; seguimiento real requiere un
  campo de estado de entrega (follow-up).
- **[Doble persistencia]** Si alguien implementa el `send` llamando a `sendText`
  sin el `messageId`, aparecen DOS burbujas del mismo mensaje (la de la tx y la
  del `OutboundProcessor`). El e2e debe assertear que hay exactamente un
  `Message` OUT tras un `send`.
- **[Opt-out concurrente]** Cubierto por el `where: { state: { not: OPTED_OUT } }`
  del `updateMany`: si el opt-out gana, la tx no escribe nada y el endpoint
  responde 409 sin `Message` ni envío (AC-2).
- **[`OPTED_OUT` nunca se pisa con `HUMAN_HANDOFF`]** Chequeo explícito ANTES de
  la tx y condición en el `updateMany`: `send` no puede "revivir" un lead dado de
  baja.
- **[Turno bufferizado que se descarta]** Los mensajes del lead que estaban en el
  buffer de debounce cuando el asesor toma la conversación ya están persistidos
  como `Message` IN y visibles en el timeline; el turno se flushea y termina en
  `silenced` sin respuesta. Correcto, pero el asesor debe poder verlos: el
  refetch de mensajes post-envío ayuda. Notificación en tiempo real está fuera de
  alcance (spec).
- **[Aislamiento multi-tenant]** Todas las queries nuevas llevan `tenantId`:
  `findLeadOrThrow` (404 unificado anti-oráculo), la query de ventana, el
  `updateMany` del lead, el `create` del `Message` y el `updateMany` del
  `waMessageId` en el `OutboundProcessor`. `PersonSessionRequiredGuard` corre
  DESPUÉS de `TenantScopeGuard`, así que el 403 cross-tenant por URL sigue
  ganando primero.
- **[Longitud del texto]** `@MaxLength(4096)` alineado al límite de body de texto
  de WhatsApp: mejor un 400 propio que un error de Meta después de haber
  persistido el `Message`.
- **[Rate limit]** El endpoint hereda el `@Throttle` de clase (120/min por
  tenant), suficiente para chat humano.
- **[Performance]** `send` = 2 SELECT + 1 tx (2 statements) + 1 `queue.add`;
  `GET :leadId` suma 1 SELECT indexado.

## Trazabilidad

- **AC-1** -> `sendManual`: tx con `updateMany` a `HUMAN_HANDOFF` +
  `handoffAt: now` y `message.create` con `sentByPersonId`, seguida de
  `messaging.sendText`.
- **AC-2** [CRÍTICO] -> chequeo `state === OPTED_OUT` -> 409 antes de cualquier
  side effect, más `where: { state: { not: OPTED_OUT } }` en el `updateMany` para
  la carrera. Unit + e2e asserteando 0 `Message` nuevos y `sendText` no invocado.
- **AC-3** -> `findLastInboundAt` + `isServiceWindowOpen` (null o `>= 24hs` ->
  cerrada) -> 409 con `SERVICE_WINDOW_CLOSED_MESSAGE` (menciona el template),
  antes de la tx.
- **AC-4** -> `SendManualMessageDto` (trim + `@IsNotEmpty`) -> ValidationPipe 400
  antes de entrar al handler.
- **AC-5** -> `PersonSessionRequiredGuard` a nivel método: sin `request.person`
  (rama API key) -> `ForbiddenException` 403 antes del handler.
- **AC-6** [CRÍTICO] -> `GuardrailsService.evaluate` sin cambios:
  `state === HUMAN_HANDOFF` con `handoffAt` fresco -> `silenced` -> el
  `ConversationEngine` corta antes del LLM. Test unit con un lead cuyo
  `HUMAN_HANDOFF` viene de `send`, más e2e que verifica que no se encola nada.
- **AC-7** [CRÍTICO] -> `withLeadLock` sobre la MISMA key que sostiene `tryFlush`
  durante todo `handleTurn`: exclusión mutua real (409 si el bot está en vuelo;
  turno posterior silenciado por guardrails). La tx cubre la consistencia
  lead-message y `sendText` se encola post-commit.
- **AC-8** [CRÍTICO] -> `resolveReleaseState`: `lastSearchIds.length > 0` ->
  `SEARCH_MATCH`; el `updateMany` setea `handoffAt: null`.
- **AC-9** -> `resolveReleaseState`: `lastSearchIds` vacío -> `QUALIFICATION`
  (regla binaria, `fOperation` no participa) + `handoffAt: null`.
- **AC-10** -> `release` deja el lead en un estado no silenciado y `handoffAt`
  nulo -> el siguiente turno pasa `evaluate` -> `continue` -> FSM. e2e.
- **AC-11** -> `updateMany` condicionado a `state: HUMAN_HANDOFF`: 0 filas -> 400
  sin modificar el lead (comportamiento actual preservado).
- **AC-12** -> el `Message` humano se crea en la misma tabla con
  `direction: OUT`, `type: TEXT`, `body`; el único diferencial es
  `sentByPersonId`. e2e comparando la fila del bot con la del humano.
- **AC-13** -> `findLeadOrThrow(tenantId, leadId)` con
  `findFirst({ id, tenantId })` -> 404 unificado en `send` y en `release`.
- **AC-14** -> `MessageTimeline` con `data-tone` de tres valores derivado de
  `direction` + `sentByPersonId`, orden preservado, `transcription` para audio.
- **AC-15** -> `LeadModeBadge` renderizado incondicionalmente en el header de
  `LeadDetailPage` (los tres modos vía `resolveLeadMode`).
- **AC-16** -> `onSent` -> `fetchLead()` + refetch de mensajes ->
  `resolveLeadMode` da modo manual -> clase del header + badge, más
  `showToast` con tono success.
- **AC-17** -> `ReleaseHandoffButton` con `Modal` de confirmación; `releaseLead`
  solo se invoca desde el botón Confirmar.
- **AC-18** -> `lastInboundAt` expuesto en el lead + cálculo del remanente en
  `ManualReplyBox` con `setInterval` de 60s.
- **AC-19** -> mismo cálculo: vencida -> `disabled` + copy explicativo, sin
  request al backend.
- **AC-20** -> `LeadRow` usa el MISMO `resolveLeadMode`/`LeadModeBadge` que
  `LeadDetailPage`.

## Plan de tests

### Unit (obligatorios — cubren los guardrails críticos)

- `src/conversation/release-state.util.spec.ts` — AC-8/AC-9: `lastSearchIds` con
  items -> `SEARCH_MATCH`; vacío con y sin `fOperation` -> `QUALIFICATION`; nunca
  devuelve `GREETING`, `HUMAN_HANDOFF` ni `OPTED_OUT`.
- `src/admin/leads/service-window.util.spec.ts` — AC-3: null -> cerrada;
  23h59m -> abierta; exactamente 24hs -> cerrada; 25hs -> cerrada.
- `src/admin/leads/admin-lead-messaging.service.spec.ts` (Prisma, Messaging y
  DebounceBuffer mockeados) — AC-2: lead `OPTED_OUT` -> throw con
  `message.create` y `sendText` NO invocados; AC-3: sin IN o IN viejo -> throw sin
  side effects; AC-7: `withLeadLock` devuelve null -> 409 y `sendText` no
  invocado; AC-1/AC-12: happy path con orden `withLeadLock` -> `$transaction` ->
  `sendText` (assertear que `sendText` corre DESPUÉS del commit y con el
  `messageId`); `updateMany` con 0 filas (opt-out concurrente) -> rollback + 409;
  fallo del encolado -> `delete` compensatorio del `Message`.
- `src/conversation/guardrails/guardrails.service.spec.ts` (extiende el
  existente) — AC-6: lead en `HUMAN_HANDOFF` con `handoffAt` reciente puesto por
  `send`, y texto sin ninguna frase de handoff -> tipo `silenced`; con `handoffAt`
  de más de 48hs -> `handoff_timeout_release`.
- spec del motor (`conversation.engine`) — AC-6: con `silenced` no se invoca el
  `LlmProvider` mockeado ni los handlers; AC-8 en el timeout: un
  `handoff_timeout_release` sobre un lead con `lastSearchIds` no vacío deja
  `SEARCH_MATCH`.
- `src/admin/guards/person-session-required.guard.spec.ts` — AC-5: request sin
  `person` -> `ForbiddenException`; con `person` -> pasa; request con ambos
  headers (API key + Bearer) -> 403 (comportamiento fijado).
- `src/messaging/outbound.processor.spec.ts` (extiende) — job de texto con
  `messageId` -> `update` del `waMessageId` sin `create` y sin
  `findOrCreateByPhone`; sin `messageId` -> comportamiento actual intacto.
- `src/pipeline/debounce-buffer.service.spec.ts` — `withLeadLock` usa la misma
  key que `tryFlush`, devuelve null si está tomado y libera siempre (incluso si
  el callback lanza).

### Frontend (vitest + RTL, junto a cada componente)

- `MessageTimeline.test.tsx` (actualiza) — AC-14: tres `data-tone`
  (`incoming`/`bot`/`human`), orden, transcripción de audio.
- `LeadModeBadge.test.tsx` (nuevo) — AC-15/AC-20: los tres modos y el default de
  IA para un estado desconocido.
- `ManualReplyBox.test.tsx` (nuevo) — AC-16 (toast + `onSent` al éxito), AC-18
  (texto del remanente), AC-19 (deshabilitado con copy si venció o si el lead
  está de baja), texto no vacío requerido, textarea preservado ante error.
- `ReleaseHandoffButton.test.tsx` (actualiza) — AC-17: no llama a `releaseLead`
  hasta confirmar en el `Modal`; cancelar no dispara nada.
- `LeadRow.test.tsx` y `LeadDetailPage.test.tsx` (actualizan) — badge presente,
  header con color por modo, `ManualReplyBox` cableado.
- `api/endpoints.test.ts` (actualiza) — `sendManualMessage` arma el POST a
  `.../send` con el body de texto y el token.

### E2E (`test/admin-lead-manual-reply.e2e-spec.ts`, nuevo)

Flujo completo con sesión de persona real (login -> token), siguiendo el patrón de
`admin-lead-management.e2e-spec.ts` y `debounce.e2e-spec.ts`:

1. `send` con sesión válida y un `Message` IN reciente -> 200; en DB: lead en
   `HUMAN_HANDOFF` con `handoffAt` seteado, exactamente **un** `Message` OUT con
   `sentByPersonId` = persona logueada (AC-1, AC-12) y un job encolado en
   `outbound` con el `messageId`.
2. `send` con `X-Api-Key` de tenant -> 403 y 0 mensajes nuevos (AC-5).
3. `send` con texto en blanco y sin body -> 400 (AC-4).
4. `send` sobre lead `OPTED_OUT` -> 409, 0 `Message`, 0 jobs (AC-2).
5. `send` sobre un lead sin ningún IN y sobre un lead con IN de 25hs -> 409 con el
   copy del template, 0 side effects (AC-3).
6. `send` y `release` con `leadId` de otro tenant -> 404 (AC-13).
7. `release` con `lastSearchIds` no vacío -> `SEARCH_MATCH` y `handoffAt` null
   (AC-8); con `lastSearchIds` vacío -> `QUALIFICATION` (AC-9); sobre un lead que
   no está en `HUMAN_HANDOFF` -> 400 sin cambios (AC-11).
8. Tras `release`, un webhook entrante del lead vuelve a pasar por el
   `ConversationEngine` (AC-10), reusando la infraestructura de
   `conversation-engine.e2e-spec.ts`.
9. Regresión de `GET :leadId` y `GET :leadId/messages`: traen `lastInboundAt`
   coherente entre sí y el resto del contrato intacto.

## Aprobaciones pendientes (pipeline crítico)

1. **Atomicidad de AC-7 vía el lock de lead del debounce** (`withLeadLock` nuevo
   en `DebounceBufferService`, misma key que `tryFlush`), con 409 al asesor si el
   bot está procesando un turno; `$transaction` + `updateMany` condicionado
   adentro y `sendText` post-commit con `delete` compensatorio si falla el
   encolado. Implica tocar `pipeline` (high).
2. **Cambio quirúrgico en `ConversationEngine.resolveGuardrail`** (recibe el
   `lead` y usa `resolveReleaseState` en `handoff_timeout_release`), para que el
   timeout de 48hs y el botón de release resuelvan el estado igual.
3. **Regla de release implementada binaria** (`lastSearchIds` no vacío ->
   `SEARCH_MATCH`, si no `QUALIFICATION`), sin la rama de `fOperation` de la
   decisión 5 porque devuelve lo mismo (AC-9 lo confirma).
4. **`handoffAt = now` en cada `send`** (refresca el timeout de 48hs mientras el
   asesor conversa).
5. **`messageId` en el job outbound de texto** para que `OutboundProcessor`
   actualice el `waMessageId` del `Message` ya persistido en vez de crear una
   segunda fila.
6. **`PersonSessionRequiredGuard` como guard marcador a nivel método** (403 si no
   hay sesión de persona), sin tocar `PersonOrApiKeyGuard`.
7. **Migración `add_message_sent_by_person`:** `Message.sentByPersonId`
   (`SetNull`, relación `MessageSender`) + `@@index([sentByPersonId])`.
8. **`lastInboundAt` como campo derivado dentro del objeto lead** de
   `GET :leadId` y `GET :leadId/messages` (aditivo, sin endpoint nuevo).
9. **Hallazgo fuera de alcance:** `InboundProcessor.respondUnsupported` responde
   automáticamente incluso en `HUMAN_HANDOFF` u `OPTED_OUT` (ningún AC de esta
   spec lo cubre) -> se propone una spec follow-up.
