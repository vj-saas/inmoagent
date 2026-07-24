# Plan A.4: Ficha del lead

> Producido por planner. Define COMO se construye lo que la spec (A.4) pide.
> Fase con migracion Prisma (high, no critica segun CLAUDE.md). El aislamiento
> multi-tenant SI es critico y se preserva sin introducir ninguna query
> cross-tenant nueva.

## Arquitectura

Tres frentes acoplados por el contrato HTTP de
`/admin/tenants/:tenantId/leads` (+ un endpoint nuevo bajo `/people`):

- **DB / Prisma (high):** una migracion aditiva. Tabla nueva `LeadNote` y tres
  columnas nullable nuevas en `Lead` (`contactedAt`, `assignedUserId`,
  `nextActionAt`) mas una relacion `Person -> Lead` para la asignacion. Todo
  aditivo y nullable: no reescribe datos existentes, no rompe el bot ni A.3.

- **Backend (medium salvo el aislamiento, ya vigente):** se introduce un
  `AdminLeadsService` que concentra la logica de escritura nueva (notas,
  contacted/uncontacted, opt-out idempotente, assignment con validacion de
  tenant) y el helper compartido `findLeadOrThrow`. El controller
  `AdminLeadsController` pasa a delegar en el service. Todos los endpoints nuevos
  cuelgan del mismo controller ya protegido por
  `TenantThrottlerGuard + PersonOrApiKeyGuard`, con el mismo patron
  `findFirst({ id, tenantId }) -> 404 unificado`. Ademas un endpoint de listado
  de personas asignables bajo `/people`, con guard de sesion (ambos roles),
  porque el listado OWNER-only de A.1 no sirve para que un AGENT arme el selector.

- **Frontend (medium):** se reemplaza el placeholder `LeadDetailPage.tsx` por la
  ficha real, compuesta de subcomponentes (`MessageTimeline`, `LeadNotes` +
  `NoteForm`, `ContactedToggle`, `AssignmentControl`, `ReleaseHandoffButton`,
  `OptOutButton`, `SuppressLeadButton` con modal). Reusa `useApi`, `Spinner`,
  `ErrorBanner`, `AuthContext` de A.2/A.3 y las funciones nuevas de
  `endpoints.ts`.

Flujo de lectura al entrar a `/leads/:leadId`: LeadDetailPage monta -> dispara
EN PARALELO `getLead` + `getLeadMessages` + `getLeadNotes` +
`listAssignableUsers` -> render de carga/error/ficha.

Flujo de escritura (nota / contacted / assignment / release / opt-out):
componente hijo llama al endpoint via `useApi` -> on success, refetch dirigido
del recurso afectado (o merge local para la lista de notas) SIN recargar toda la
pantalla.

## Entidades / modulos afectados

### DB (prisma/schema.prisma) — migracion
- **`model LeadNote` (nuevo)**: tabla de notas humanas (alta+lectura).
- **`model Lead` (modifica)**: +`contactedAt`, +`assignedUserId`,
  +`nextActionAt`, +relacion inversa `notes LeadNote[]`, +relacion
  `assignedUser Person?`.
- **`model Person` (modifica)**: +relacion inversa `assignedLeads Lead[]` y
  +`authoredNotes LeadNote[]`.
- **`model Tenant` (modifica)**: +relacion inversa `leadNotes LeadNote[]`.

### Backend
- `src/admin/leads/admin-leads.service.ts` (**nuevo**): logica de escritura +
  `findLeadOrThrow`. Registrado en `AdminModule.providers`.
- `src/admin/leads/admin-leads.controller.ts` (**modifica**): nuevos handlers
  `createNote`, `listNotes`, `markContacted`, `markUncontacted`, `optOut`,
  `patchAssignment`; los handlers existentes se migran a `findLeadOrThrow`.
- `src/admin/leads/dto/create-note.dto.ts` (**nuevo**).
- `src/admin/leads/dto/patch-assignment.dto.ts` (**nuevo**).
- `src/auth/admin-people.controller.ts` (**modifica**): `GET :tenantId/people/assignable`.
- `src/auth/people.service.ts` (**modifica**): `listAssignable(tenantId)`.
- `src/admin/admin.module.ts` (**modifica**): agrega `AdminLeadsService`.
- e2e `test/admin-leads.e2e-spec.ts` (**extiende**) y opcional
  `test/admin-lead-notes.e2e-spec.ts` (**nuevo**).

### Frontend (frontend/src/)
- `api/endpoints.ts` (**modifica**): tipa `LeadNote`, `AssignableUser`; extiende
  `Lead` con los tres campos; agrega `createNote`, `getLeadNotes`,
  `markContacted`, `markUncontacted`, `optOutLead`, `patchAssignment`,
  `listAssignableUsers`. Consume `getLead`, `getLeadMessages`, `releaseLead`,
  `suppressLead` (ya existen; se les saca el TODO).
- `routes/LeadDetailPage.tsx` (**reescribe**): orquestador.
- `components/leads/MessageTimeline.tsx` (**nuevo**).
- `components/leads/LeadNotes.tsx` + `NoteForm.tsx` (**nuevo**).
- `components/leads/ContactedToggle.tsx` (**nuevo**).
- `components/leads/AssignmentControl.tsx` (**nuevo**).
- `components/leads/ReleaseHandoffButton.tsx` (**nuevo**).
- `components/leads/OptOutButton.tsx` (**nuevo**).
- `components/leads/SuppressLeadButton.tsx` (**nuevo**, con modal).
- `components/leads/LeadSummary.tsx` (**nuevo**, opcional; reusa `LeadChips`).
- Tests `*.test.tsx` de cada componente nuevo.
- Rutas / `App.tsx`: sin cambios (`/leads/:leadId` ya existe de A.3).

## Migracion Prisma (diff conceptual del schema)

```prisma
model LeadNote {
  id             String   @id @default(cuid())
  tenantId       String
  tenant         Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  leadId         String
  lead           Lead     @relation(fields: [leadId], references: [id], onDelete: Cascade)
  authorPersonId String?  // nullable: ver decision «autor nullable»
  author         Person?  @relation(fields: [authorPersonId], references: [id], onDelete: SetNull)
  body           String
  createdAt      DateTime @default(now())

  @@index([tenantId, leadId, createdAt])
}

model Lead {
  // ... campos existentes ...
  contactedAt    DateTime?
  assignedUserId String?
  assignedUser   Person?   @relation("LeadAssignee", fields: [assignedUserId], references: [id], onDelete: SetNull)
  nextActionAt   DateTime?
  notes          LeadNote[]
}

model Person {
  // ... campos existentes ...
  assignedLeads Lead[]     @relation("LeadAssignee")
  authoredNotes LeadNote[]
}

model Tenant {
  // ... relaciones existentes ...
  leadNotes LeadNote[]
}
```

Decisiones de la migracion:

- **`LeadNote.tenantId` explicito ademas de `leadId`.** Se desnormaliza igual que
  en `Message`/`Appointment` (mismo patron del schema) para filtrar
  `{ tenantId, leadId }` en una sola query sin join y mantener el aislamiento
  uniforme. Cascade on delete del tenant y del lead: la supresion Ley 25.326 (A.3)
  arrastra las notas igual que arrastra `Message` (el comentario del `suppress` se
  actualiza a "cascade: Message, Appointment, LeadNote").
- **Indice `@@index([tenantId, leadId, createdAt])`.** Cubre exactamente
  `GET :leadId/notes` (where tenantId+leadId, orderBy createdAt desc). Mismo
  criterio que el indice de `Message`.
- **`authorPersonId` nullable + `onDelete: SetNull`.** Ver decision dedicada.
- **`Lead.assignedUserId` nullable + `onDelete: SetNull`.** Lo pide la spec. Si se
  hard-borra la Person asignada, el lead no debe desaparecer ni bloquear el
  borrado: queda sin asignar. (A.1 `deactivate` es soft-delete `active=false`, no
  `delete`; el SetNull cubre un hard-delete futuro.) NUNCA Cascade: un lead no se
  borra por borrar una persona.
- **Los tres campos de `Lead` son nullable, sin default.** Aditivo puro: los leads
  existentes quedan `null` (no contactado, sin asignar, sin proxima accion), que
  es la semantica correcta. Sin backfill.
- Clasificacion: **high** por cambio de schema (CLAUDE.md), NO critico.

## Decisiones tecnicas

### Backend

- **Extraer `AdminLeadsService` + helper `findLeadOrThrow` (SI vale la pena).**
  Hoy el patron `findFirst({ id, tenantId }) -> throw NotFound('Lead no
  encontrado')` se repite en `getOne`, `messages`, `release`, `suppress` (4
  veces) y A.4 suma 5 handlers mas (notes GET/POST, contacted, uncontacted,
  opt-out, assignment): **9+ repeticiones** del mismo bloque, y ese 404 unificado
  es justamente la barrera anti-oraculo de existencia cross-tenant (superficie
  sensible). Centralizarlo reduce la chance de que un handler nuevo lo escriba mal
  (p.ej. filtrar solo por `id` y comparar tenant despues, que abriria una fuga).
  No es sobre-ingenieria: un `Injectable` con metodos de una-dos lineas. El
  service ademas aloja la logica que necesita mas que un update trivial (opt-out
  idempotente, validacion de assignment), dejando el controller como capa HTTP
  fina. Alternativa descartada: dejar todo en el controller con un metodo privado
  — funciona, pero con 9 handlers y reglas reales (idempotencia, validacion
  cross-entidad) el controller se vuelve gordo y mezcla HTTP con negocio. Firma:
  `findLeadOrThrow(tenantId, leadId, tx?)` — acepta client de transaccion opcional
  para reusarlo en `$transaction` (opt-out).

- **`POST :leadId/notes`.** DTO `CreateNoteDto`: `body: string` con
  `@IsString() @IsNotEmpty()` + `@MaxLength(2000)` (cota defensiva). Trim en el
  service. Body vacio/ausente/solo-espacios -> 400 (AC-6); el ValidationPipe
  global con whitelist rechaza props extra. Autor: `req.person?.id` (ver decision
  «autor nullable»). Persiste `{ tenantId, leadId, authorPersonId, body }`.
  Respuesta 201 con la nota creada, `author` resuelto a `{ id, email } | null`
  (asi el frontend la inserta sin refetch — AC-7).

- **`GET :leadId/notes`.** `findLeadOrThrow` -> `leadNote.findMany({ where:
  { tenantId, leadId }, orderBy: { createdAt: 'desc' }, include: { author:
  { select: { id, email } } } })`. Respuesta `{ notes: [...] }` (AC-8).

- **`POST :leadId/contacted` / `.../uncontacted`.** `findLeadOrThrow` ->
  `lead.update({ data: { contactedAt: new Date() } })` / `{ contactedAt: null }`.
  Devuelve el lead completo (mismo shape que `getOne`) para refresco directo en el
  frontend (AC-9/AC-10). Dos POST separados (no un PATCH con body) por simetria
  con `release` y para que el frontend no mande payload. HttpCode 200.

- **`POST :leadId/opt-out` (idempotente).** Dentro de `$transaction`:
  `findLeadOrThrow(tx)` -> si `state === OPTED_OUT` devuelve el lead SIN tocar
  `optedOutAt` (AC-17); si no, `update({ state: OPTED_OUT, optedOutAt: now() })`
  (AC-16). Semantica identica al opt-out del bot (regla 6): no se le vuelve a
  escribir. NO envia mensaje al lead: solo marca estado. La transaccion evita una
  carrera con un turno del bot entre read y write. 200.

- **`PATCH :leadId/assignment`.** DTO `PatchAssignmentDto`:
  `assignedUserId?: string | null` y `nextActionAt?: string | null`
  (`@IsOptional()`, `@IsDateString()` para el segundo; tolerar `null` explicito con
  `@ValidateIf`). **Semantica PATCH:** solo se tocan los campos PRESENTES en el
  body; presencia detectada por `hasOwnProperty` (distingue "no mandado" de
  "mandado como null para limpiar"). Validacion de `assignedUserId` (si viene y no
  es null): `person.findFirst({ where: { id, tenantId } })`; si null -> **400**
  (AC-13). Es 400 (no 404) porque el recurso de la URL —el lead— existe; lo
  invalido es un valor del body. La query filtra por el mismo `tenantId` de la
  URL: no cruza tenants. Devuelve el lead actualizado (AC-12/AC-14). PATCH, 200.

- **`getOne` extendido (AC-20): sin codigo nuevo.** Ya devuelve el objeto Lead
  completo de Prisma; al sumar las columnas al modelo aparecen solas. Se agrega
  assertion en e2e. Consistente con A.3 (objeto Prisma directo, sin mapper).

- **Endpoint de personas asignables — NO existe reusable, se crea.** El unico
  listado es `GET :tenantId/people`, guardado por `OwnerRoleGuard` (**solo
  OWNER**). El selector lo usa tambien un **AGENT**, que ahi recibiria 403; ademas
  devuelve todas las personas (incluidas inactivas) con mas datos de los
  necesarios. Se agrega **`GET /admin/tenants/:tenantId/people/assignable`**,
  guardado por `PersonSessionGuard + TenantScopeGuard` (ambos roles, sin
  `OwnerRoleGuard`), que devuelve `{ users: [{ id, email, role }] }` solo de
  personas **activas** del tenant. Vive en `AdminPeopleController` (es listado de
  personas) y reusa `PeopleService.listAssignable`. `AdminPeopleController` ya usa
  `@UseGuards` por-handler, asi que el endpoint nuevo declara su cadena sin afectar
  los demas. NO usa `PersonOrApiKeyGuard`: es del panel humano, no hay caso
  server-to-server que liste personas. Alternativas descartadas: relajar el
  listado OWNER-only (rompe AC de A.1) o colgarlo del controller de leads (mezcla
  responsabilidades).

- **Aislamiento multi-tenant (critico, ya vigente).** Ningun endpoint nuevo
  introduce query cross-tenant: todos filtran por el `tenantId` del Param, ya
  autorizado por `PersonOrApiKeyGuard` (rama sesion -> `TenantScopeGuard`, 403 en
  cross-tenant por URL — AC-22). El 404 unificado de `findLeadOrThrow` evita el
  oraculo de existencia (AC-21). La validacion de `assignedUserId` filtra por el
  mismo tenant (un id de otro tenant da 400 igual que uno inexistente). e2e de
  regresion cross-tenant.

### Frontend

- **Carga inicial en paralelo, cuatro recursos.** LeadDetailPage dispara al
  montar `getLead`, `getLeadMessages`, `getLeadNotes` y `listAssignableUsers`
  (cada uno con su `useApi`). Spinner mientras cualquiera de los criticos (lead +
  messages) este pendiente; ErrorBanner en espanol si lead o messages fallan, sin
  ficha vacia (AC-1/2/3), mismo patron que A.3. Notas y assignable-users son
  secundarios: si fallan, la ficha se muestra igual con aviso local en su seccion,
  no tumban la pantalla. `tenantId` desde `AuthContext`.

- **Refetch dirigido tras cada escritura, sin recargar (AC-7/11/15).**
  - **Nota**: la respuesta del POST ya trae la nota con autor+fecha ->
    `setNotes([nueva, ...notas])`. Sin refetch de la lista.
  - **contacted/uncontacted, opt-out, assignment**: el endpoint devuelve el lead
    actualizado -> `setLead(resp)`; el estado visible se re-renderiza del lead en
    memoria.
  - **release**: devuelve `{ released: true }` (no el lead) -> tras exito, refetch
    puntual de `getLead` para reflejar el nuevo `state` (AC-15). El boton se oculta
    cuando `lead.state !== 'HUMAN_HANDOFF'`.
  - Ninguna accion recarga la pagina ni re-dispara las cuatro llamadas iniciales.

- **MessageTimeline (AC-4).** El backend ya devuelve `orderBy createdAt asc`; el
  componente NO reordena. Distingue IN/OUT por alineacion/estilo, muestra
  `body`/`transcription`, `type` y fecha.

- **AssignmentControl.** Selector poblado con `listAssignableUsers` +
  `datetime-local` para `nextActionAt`. Al confirmar arma el PATCH con solo los
  campos cambiados; "desasignar" manda `assignedUserId: null`. Muestra el asignado
  actual resolviendo `lead.assignedUserId` contra la lista (email); si el id no
  esta (persona desactivada) muestra el identificador crudo (fallback permitido).

- **SuppressLeadButton (AC-18/19).** Modal de confirmacion explicita en espanol.
  Solo al confirmar invoca `suppressLead` (`DELETE :leadId`); tras exito
  `navigate('/leads')`. Sin confirmar NUNCA se llama al DELETE (estado local
  `confirming`).

- **OptOutButton.** Invoca `optOutLead`; `setLead(resp)`. Con confirmacion breve
  (accion sensible pero reversible por el equipo, no destructiva como suprimir).
  Deshabilitado/oculto si el lead ya esta `OPTED_OUT`.

- **endpoints.ts: sacar los `TODO(A.3)` y tipar.** `getLead`, `getLeadMessages`,
  `releaseLead`, `suppressLead` ya existen como stubs; A.4 los consume. Se agrega
  `LeadNote`, `AssignableUser`, se extiende `Lead` con `contactedAt`,
  `assignedUserId`, `nextActionAt` (todos `string | null` salvo assignedUserId), y
  `getLeadMessages` se tipa con `Message` real.

- **Toda la UI en espanol (AC-23)** y **sin selector generico de
  ConversationState (AC-24):** solo se exponen ReleaseHandoffButton (visible solo
  en HUMAN_HANDOFF) y OptOutButton.

## Riesgos y edge cases

- **[Autor nullable] Notas via API key no tienen persona.** El controller acepta
  ambos caminos de auth (`PersonOrApiKeyGuard`); en la rama API key `req.person`
  es `undefined`, por eso `authorPersonId` DEBE ser nullable (`String?` +
  `SetNull`). `authorPersonId = req.person?.id ?? null`. El frontend siempre usa
  sesion, pero el modelo no puede asumirlo sin romper el camino server-to-server
  ni el hard-delete de persona. `author` se devuelve `null` en ese caso y el
  frontend muestra "Sistema"/"—". (Si el negocio exige autor obligatorio, exigir
  sesion en notes — decision para aprobacion.)
- **[Supresion arrastra notas]** Cascade correcto para Ley 25.326 (sin rastro del
  lead). Se actualiza el comentario del `suppress`.
- **[PATCH parcial] null vs ausente.** Sutil con class-validator: `@IsOptional()`
  + deteccion de presencia por `hasOwnProperty`. e2e: mandar solo `nextActionAt` no
  borra `assignedUserId`; `assignedUserId: null` si lo limpia.
- **[Carrera opt-out vs bot]** Se resuelve en `$transaction`. Impacto bajo, pero
  el opt-out es regla innegociable.
- **[Assignment 400 vs 404]** `assignedUserId` invalido -> 400 (lead existe);
  `leadId` invalido -> 404. La validacion de persona corre DESPUES de
  `findLeadOrThrow`. e2e de ambos.
- **[assignedUserId de otro tenant]** 400 sin revelar existencia cross-tenant (el
  `findFirst` filtra por tenantId; indistinguible de inexistente).
- **[Timeline grande]** Se cargan todos los mensajes (sin paginacion del timeline:
  fuera de alcance). Aceptable por volumen acotado por lead; paginar es follow-up.
- **[Decimal / fechas como string]** Igual que A.3: `fMaxPrice` string en JSON; las
  fechas nuevas llegan ISO string y se formatean sin asumir `Date`.
- **[Persona desactivada asignada]** No aparece en `assignable` (solo activas); el
  frontend hace fallback al id crudo y permite reasignar.

## Trazabilidad

- **AC-1** -> LeadDetailPage dispara `getLead` + `getLeadMessages` en paralelo al
  montar y renderiza ambos al resolver.
- **AC-2** -> `useApi.loading` combinado -> Spinner mientras lead o messages estan
  en curso.
- **AC-3** -> `useApi.error` de lead/messages -> ErrorBanner en espanol, distinto
  de "ficha vacia".
- **AC-4** -> MessageTimeline respeta el `orderBy createdAt asc` del backend y
  estila IN vs OUT distinto.
- **AC-5** -> `POST :leadId/notes` crea LeadNote con `authorPersonId =
  req.person.id` y `createdAt = now()`, y la devuelve con autor resuelto.
- **AC-6** -> `CreateNoteDto` con `@IsNotEmpty` + ValidationPipe -> 400 sin crear.
- **AC-7** -> NoteForm inserta la nota devuelta al tope de LeadNotes (local), sin
  refetch total.
- **AC-8** -> `GET :leadId/notes` `orderBy createdAt desc` con autor incluido.
- **AC-9** -> `POST :leadId/contacted` set `contactedAt=now()`, devuelve lead;
  ContactedToggle hace setLead.
- **AC-10** -> `POST :leadId/uncontacted` set `contactedAt=null`, devuelve lead.
- **AC-11** -> setLead(resp) re-renderiza el toggle sin recargar.
- **AC-12** -> `PATCH :leadId/assignment` valida persona del tenant, update
  `assignedUserId`, devuelve lead.
- **AC-13** -> persona inexistente/otro tenant -> `findFirst {id,tenantId}` null ->
  400 sin modificar.
- **AC-14** -> `PATCH` con `nextActionAt` -> update del campo, devuelve lead.
- **AC-15** -> ReleaseHandoffButton (solo en HUMAN_HANDOFF) llama `releaseLead`,
  luego refetch `getLead` -> estado ya no HUMAN_HANDOFF.
- **AC-16** -> `POST :leadId/opt-out` set `state=OPTED_OUT`, `optedOutAt=now()`.
- **AC-17** -> si ya OPTED_OUT, devuelve sin tocar `optedOutAt` (idempotente).
- **AC-18** -> SuppressLeadButton confirma -> `suppressLead` (DELETE) ->
  `navigate('/leads')`.
- **AC-19** -> estado `confirming`: sin confirmar no se invoca el DELETE.
- **AC-20** -> `getOne` devuelve el Lead completo, ya incluye los tres campos
  nuevos; e2e lo asevera.
- **AC-21** -> `findLeadOrThrow` con `findFirst {id,tenantId}` -> 404 unificado en
  todos los endpoints nuevos.
- **AC-22** -> `PersonOrApiKeyGuard` (rama sesion -> TenantScopeGuard) da 403 por
  URL cross-tenant antes del handler; e2e de regresion.
- **AC-23** -> todos los textos/labels/errores/confirmaciones en espanol.
- **AC-24** -> no se expone endpoint ni control de estado generico; solo release y
  opt-out.

## Aprobaciones pendientes

> Todas aprobadas por el usuario (2026-07-24), tal como las proponía el plan.

1. **APROBADO:** Migracion Prisma con tabla `LeadNote` + 3 columnas en `Lead`
   + relaciones `Person`/`Tenant`, segun el diff conceptual. `high` (schema),
   no critico.
2. **APROBADO:** `authorPersonId` nullable (`SetNull`) para soportar el
   camino API key y el hard-delete de persona.
3. **APROBADO:** Nuevo endpoint `GET :tenantId/people/assignable` (sesion,
   ambos roles, solo personas activas), sin tocar el listado OWNER-only
   existente de A.1.
4. **APROBADO:** Extraer `AdminLeadsService` + helper `findLeadOrThrow`
   (refactor de los 4 handlers existentes + los 5 nuevos).
5. **APROBADO:** Semantica PATCH parcial de assignment (null = limpiar,
   ausente = no tocar) con deteccion por presencia de campo.
