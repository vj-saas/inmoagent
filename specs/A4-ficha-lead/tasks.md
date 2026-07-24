# Tasks A.4: Ficha del lead

> Producido por task-splitter. Cada tarea es atómica y despachable a un
> implementer según su dificultad (criterios de `CLAUDE.md`).

---

## T1 — Migración Prisma: `LeadNote` + columnas nuevas en `Lead`
- **Dificultad:** high
- **Descripción:** Editar `prisma/schema.prisma` agregando el modelo `LeadNote`
  (`id`, `tenantId`, `leadId`, `authorPersonId` nullable, `body`, `createdAt`,
  índice `@@index([tenantId, leadId, createdAt])`, relaciones a `Tenant`
  (`Cascade`), `Lead` (`Cascade`) y `Person` (`SetNull`)); agregar a `Lead`
  `contactedAt: DateTime?`, `assignedUserId: String?`, `assignedUser: Person?`
  (relación `"LeadAssignee"`, `onDelete: SetNull`), `nextActionAt: DateTime?`,
  `notes: LeadNote[]`; agregar a `Person` las relaciones inversas
  `assignedLeads Lead[]` y `authoredNotes LeadNote[]`; agregar a `Tenant`
  `leadNotes LeadNote[]`. Todo nullable/aditivo, sin default, sin backfill.
  Correr `npx prisma migrate dev` generando la migración, y actualizar el
  comentario del `suppress` (cascade: Message, Appointment, LeadNote) según
  indica el plan. Verificar que la migración aplica limpio sobre la DB de
  dev/test y que `npx prisma generate` no rompe el build existente.
- **Valida:** precondición estructural de AC-5, AC-8, AC-9, AC-10, AC-12,
  AC-14, AC-20 (ningún AC de la migración en sí, pero ninguno de esos puede
  pasar sin ella).
- **Dependencias:** ninguna
- **Paralelizable:** no (bloquea todo el backend de leads nuevo)

---

## T2 — Refactor `AdminLeadsService` + `findLeadOrThrow` sobre handlers existentes
- **Dificultad:** high
- **Descripción:** Crear `src/admin/leads/admin-leads.service.ts` con el
  helper `findLeadOrThrow(tenantId, leadId, tx?)` (acepta cliente de
  transacción opcional) que centraliza el patrón
  `findFirst({ id, tenantId }) -> NotFoundException` ya usado. Migrar los 4
  handlers existentes del controller (`getOne`, `messages`, `release`,
  `suppress`) para que deleguen en el service y usen `findLeadOrThrow` en vez
  de repetir el `findFirst` inline. Registrar `AdminLeadsService` en
  `AdminModule.providers`. Criterio explícito de aceptación de esta tarea:
  **ningún test e2e existente de `test/admin-leads.e2e-spec.ts` (ni ningún
  otro e2e que toque estos 4 endpoints) puede romperse** — correr la suite
  completa antes de dar la tarea por terminada. No agrega endpoints nuevos
  todavía.
- **Valida:** AC-21 (base del 404 unificado que consumen T3-T7); regresión de
  los tests e2e existentes de `getOne`/`messages`/`release`/`suppress`
  (sin AC propio nuevo, pero es condición de no-regresión explícita).
- **Dependencias:** T1
- **Paralelizable:** no (todas las tareas de endpoints nuevos del leads
  controller dependen de esta)

---

## T3 — Endpoints de notas: `POST` y `GET :leadId/notes`
- **Dificultad:** medium
- **Descripción:** Crear `src/admin/leads/dto/create-note.dto.ts`
  (`body: string`, `@IsString() @IsNotEmpty() @MaxLength(2000)`, trim en el
  service). Agregar a `AdminLeadsService`: `createNote(tenantId, leadId,
  authorPersonId | null, body)` que usa `findLeadOrThrow` y persiste
  `{ tenantId, leadId, authorPersonId, body }`, devolviendo la nota con
  `author` resuelto a `{ id, email } | null`; y `listNotes(tenantId, leadId)`
  con `findMany({ where: { tenantId, leadId }, orderBy: { createdAt: 'desc'
  }, include: { author: { select: { id, email } } } })`. Agregar handlers
  `POST :leadId/notes` (201, autor = `req.person?.id ?? null`) y
  `GET :leadId/notes` (200, `{ notes: [...] }`) al `AdminLeadsController`,
  mismos guards que el resto (`TenantThrottlerGuard`, `PersonOrApiKeyGuard`).
- **Valida:** AC-5, AC-6, AC-8 vía `test/admin-leads.e2e-spec.ts` (o
  `test/admin-lead-notes.e2e-spec.ts` nuevo, según defina el implementer),
  además de AC-21/AC-22 (404/403) aplicados a estos dos endpoints.
- **Dependencias:** T2
- **Paralelizable:** sí (junto con T4, T5, T6)

---

## T4 — Endpoints `POST :leadId/contacted` y `POST :leadId/uncontacted`
- **Dificultad:** medium
- **Descripción:** Agregar a `AdminLeadsService` los métodos
  `markContacted(tenantId, leadId)` (`findLeadOrThrow` + `update({ data: {
  contactedAt: new Date() } })`) y `markUncontacted(tenantId, leadId)`
  (mismo patrón con `contactedAt: null`), devolviendo el lead completo (mismo
  shape que `getOne`). Agregar los dos handlers `POST` al controller,
  `HttpCode(200)`, mismos guards.
- **Valida:** AC-9, AC-10 vía `test/admin-leads.e2e-spec.ts`, más AC-21/AC-22
  (404/403) sobre ambos endpoints.
- **Dependencias:** T2
- **Paralelizable:** sí (junto con T3, T5, T6)

---

## T5 — Endpoint `POST :leadId/opt-out` (transaccional, idempotente)
- **Dificultad:** high
- **Descripción:** Agregar a `AdminLeadsService` el método `optOut(tenantId,
  leadId)` ejecutado dentro de `prisma.$transaction`: usa `findLeadOrThrow`
  con el cliente de transacción; si `state === 'OPTED_OUT'` devuelve el lead
  sin tocar `optedOutAt` (idempotencia); si no, `update({ state:
  'OPTED_OUT', optedOutAt: new Date() })`. No envía mensaje al lead, solo
  marca estado. Agregar handler `POST :leadId/opt-out` al controller
  (`HttpCode(200)`, mismos guards). Se etiqueta `high` (no `medium`) porque,
  a diferencia del resto de los endpoints CRUD estándar del módulo, introduce
  lógica transaccional nueva para resolver una carrera real con el bot sobre
  una regla de negocio innegociable (opt-out, regla 6 de `CLAUDE.md`); es
  justo el tipo de caso donde el plan dice "evaluá si sube a high" y la
  presencia de `$transaction` + regla innegociable inclina la balanza.
- **Valida:** AC-16, AC-17 vía `test/admin-leads.e2e-spec.ts`, más
  AC-21/AC-22 (404/403).
- **Dependencias:** T2
- **Paralelizable:** sí (junto con T3, T4, T6)

---

## T6 — Endpoint `PATCH :leadId/assignment` (semántica parcial)
- **Dificultad:** medium
- **Descripción:** Crear `src/admin/leads/dto/patch-assignment.dto.ts`
  (`assignedUserId?: string | null`, `nextActionAt?: string | null`, ambos
  `@IsOptional()`, `nextActionAt` con `@IsDateString()` tolerando `null`
  explícito vía `@ValidateIf`). Agregar a `AdminLeadsService`
  `patchAssignment(tenantId, leadId, dto)`: usa `findLeadOrThrow`; detecta
  presencia de cada campo por `hasOwnProperty` en el body crudo (no en el DTO
  ya validado, para distinguir "no mandado" de "mandado como null"); si
  `assignedUserId` está presente y no es `null`, valida
  `person.findFirst({ where: { id, tenantId } })` — si no existe o es de otro
  tenant, 400 (`BadRequestException`) sin modificar el lead; solo actualiza
  los campos presentes. Devuelve el lead actualizado. Agregar handler `PATCH
  :leadId/assignment` al controller, mismos guards.
- **Valida:** AC-12, AC-13, AC-14 vía `test/admin-leads.e2e-spec.ts`
  (incluyendo el caso "solo `nextActionAt` no borra `assignedUserId`"), más
  AC-21/AC-22.
- **Dependencias:** T2
- **Paralelizable:** sí (junto con T3, T4, T5)

---

## T7 — Verificar `GET :leadId` expone los tres campos nuevos
- **Dificultad:** medium
- **Descripción:** Sin cambio de código en el handler `getOne` (ya devuelve
  el objeto Prisma completo, según decisión del plan): agregar la aserción
  e2e que confirma que la respuesta incluye `contactedAt`, `assignedUserId`,
  `nextActionAt` junto con los campos ya expuestos desde A.3. Si al correrlo
  falta alguno de los tres campos (p. ej. por un `select` explícito olvidado
  en algún lado), corregirlo.
- **Valida:** AC-20 vía `test/admin-leads.e2e-spec.ts`.
- **Dependencias:** T1, T2
- **Paralelizable:** sí (junto con T3-T6)

---

## T8 — e2e de regresión multi-tenant sobre los endpoints nuevos
- **Dificultad:** high
- **Descripción:** Agregar casos e2e explícitos que cubran, para cada
  endpoint nuevo de esta spec (`notes` POST/GET, `contacted`, `uncontacted`,
  `opt-out`, `assignment`): (a) `leadId` inexistente o de otro tenant → 404
  sin exponer datos (AC-21); (b) sesión de tenant A invocando con `:tenantId`
  de tenant B en la URL → 403 sin exponer ni modificar datos de B (AC-22);
  (c) caso específico de `assignment` con `assignedUserId` de otro tenant →
  400, no 404 (distinción del plan). Se etiqueta `high` porque es la
  superficie crítica de aislamiento multi-tenant del proyecto, aunque no
  introduce query nueva (usa la protección ya vigente de `T2`/`T6`): la
  verificación explícita de esa garantía en cada endpoint nuevo amerita el
  nivel más alto según el criterio de "ante la duda, el nivel más alto".
- **Valida:** AC-21, AC-22 (cobertura explícita y exhaustiva sobre los 6
  endpoints nuevos, más allá de lo ya cubierto individualmente en T3-T6).
- **Dependencias:** T3, T4, T5, T6
- **Paralelizable:** no (necesita todos los endpoints nuevos existentes)

---

## T9 — Endpoint `GET /admin/tenants/:tenantId/people/assignable`
- **Dificultad:** medium
- **Descripción:** Agregar `listAssignable(tenantId)` a
  `src/auth/people.service.ts` (`findMany({ where: { tenantId, active: true
  }, select: { id, email, role } })`). Agregar handler `GET
  :tenantId/people/assignable` a `src/auth/admin-people.controller.ts`, con
  cadena de guards propia por-handler: `PersonSessionGuard +
  TenantScopeGuard` (ambos roles, sin `OwnerRoleGuard`, sin
  `PersonOrApiKeyGuard`), sin afectar el listado OWNER-only existente
  (`GET :tenantId/people`). Respuesta `{ users: [{ id, email, role }] }`.
  Este endpoint no toca `src/admin/leads/` y puede desarrollarse en paralelo
  con todo el bloque de leads.
- **Valida:** precondición de AC-12 (fuente de personas para el selector de
  asignación) y de AC-1 en el frontend (carga en paralelo de
  `listAssignableUsers`); sin AC numerado propio en la spec, se valida vía
  test e2e nuevo de `people.assignable` que confirme 200 solo-activos,
  ambos roles, y 403 cross-tenant.
- **Dependencias:** ninguna
- **Paralelizable:** sí (independiente de T1-T8)

---

## T10 — `endpoints.ts`: tipos y funciones nuevas del frontend
- **Dificultad:** medium
- **Descripción:** En `frontend/src/api/endpoints.ts`: agregar tipos
  `LeadNote`, `AssignableUser`; extender el tipo `Lead` con `contactedAt`,
  `assignedUserId`, `nextActionAt` (`string | null`); agregar funciones
  `createNote`, `getLeadNotes`, `markContacted`, `markUncontacted`,
  `optOutLead`, `patchAssignment`, `listAssignableUsers`; sacar los
  `TODO(A.3)` de `getLead`, `getLeadMessages`, `releaseLead`, `suppressLead`
  (ya existen como stubs) y tipar `getLeadMessages` con el tipo `Message`
  real. No requiere backend corriendo para completarse (contratos definidos
  por la spec/plan), pero sus llamadas reales dependen de que T1-T9 estén
  desplegados para funcionar end-to-end.
- **Valida:** precondición de AC-1, AC-5, AC-7 a AC-20 en el frontend (todas
  las tareas de UI dependen de estas funciones); sin test propio de backend,
  se valida junto con los componentes que la consumen (T11-T17).
- **Dependencias:** ninguna (puede escribirse contra el contrato de la spec
  sin esperar que el backend esté mergeado, pero su integración real sí)
- **Paralelizable:** sí

---

## T11 — `LeadDetailPage.tsx`: orquestador (carga paralela + error/loading)
- **Dificultad:** medium
- **Descripción:** Reescribir `frontend/src/routes/LeadDetailPage.tsx`
  reemplazando el placeholder. Al montar, dispara en paralelo `getLead`,
  `getLeadMessages`, `getLeadNotes`, `listAssignableUsers` (cada uno con su
  `useApi`). Muestra `Spinner` mientras lead o messages (críticos) están
  pendientes; `ErrorBanner` en español si lead o messages fallan, sin
  renderizar una ficha vacía. Notas y assignable-users son secundarios: si
  fallan, la ficha se muestra igual con aviso local en su sección. Compone
  (sin implementar su lógica interna todavía) los subcomponentes
  `MessageTimeline`, `LeadNotes`, `ContactedToggle`, `AssignmentControl`,
  `ReleaseHandoffButton`, `OptOutButton`, `SuppressLeadButton` recibiendo el
  `lead`/`notes`/`messages`/`assignableUsers` y los setters necesarios para
  el refetch dirigido (`setLead`, `setNotes`) por props. `tenantId` desde
  `AuthContext`.
- **Valida:** AC-1, AC-2, AC-3 vía tests de `LeadDetailPage.test.tsx`;
  habilita AC-7, AC-11, AC-15 (que se validan en los componentes hijos, T13,
  T14, T16).
- **Dependencias:** T10
- **Paralelizable:** no (los componentes hijos T12-T17 necesitan la forma de
  props que define esta tarea antes de integrarse, aunque pueden
  desarrollarse de forma aislada primero — ver T12-T17)

---

## T12 — Componente `MessageTimeline`
- **Dificultad:** low
- **Descripción:** Crear `frontend/src/components/leads/MessageTimeline.tsx`.
  Recibe la lista de mensajes ya ordenada por el backend (`createdAt asc`) y
  la renderiza sin reordenar, distinguiendo visualmente `direction` IN/OUT
  (alineación/estilo), mostrando `body`/`transcription`, `type` y fecha
  formateada. Puede desarrollarse de forma aislada con props mockeadas antes
  de integrarse a `LeadDetailPage`.
- **Valida:** AC-4 vía `MessageTimeline.test.tsx`.
- **Dependencias:** ninguna
- **Paralelizable:** sí

---

## T13 — Componentes `LeadNotes` + `NoteForm`
- **Dificultad:** medium
- **Descripción:** Crear `frontend/src/components/leads/LeadNotes.tsx` (lista
  de notas con autor + fecha) y `NoteForm.tsx` (textarea no vacío, invoca
  `createNote`; al recibir la nota creada la inserta al tope de la lista en
  memoria vía el setter recibido por props, sin refetch ni recarga de
  página). Mensajes de error de validación en español si el texto está
  vacío. Desarrollable de forma aislada con `createNote` mockeado antes de
  integrarse a `LeadDetailPage`.
- **Valida:** AC-5 (disparo del POST), AC-6 (rechazo de texto vacío en el
  form), AC-7 (inserción sin recarga) vía `LeadNotes.test.tsx` /
  `NoteForm.test.tsx`.
- **Dependencias:** T10
- **Paralelizable:** sí (independiente de T12, T14-T17)

---

## T14 — Componente `ContactedToggle`
- **Dificultad:** low
- **Descripción:** Crear `frontend/src/components/leads/ContactedToggle.tsx`:
  botón/checkbox que invoca `markContacted`/`markUncontacted` según el
  estado actual de `contactedAt`, y al recibir el lead actualizado llama al
  setter recibido por props para reflejar el nuevo estado sin recargar la
  página. Desarrollable con props mockeadas.
- **Valida:** AC-9, AC-10, AC-11 vía `ContactedToggle.test.tsx`.
- **Dependencias:** T10
- **Paralelizable:** sí

---

## T15 — Componente `AssignmentControl`
- **Dificultad:** medium
- **Descripción:** Crear `frontend/src/components/leads/AssignmentControl.tsx`:
  selector poblado con `assignableUsers` (de `listAssignableUsers`) +
  `datetime-local` para `nextActionAt`. Al confirmar arma el `PATCH` con
  solo los campos cambiados (semántica parcial: "desasignar" manda
  `assignedUserId: null` explícito; si no se toca un campo, no se incluye en
  el body). Muestra el asignado actual resolviendo `lead.assignedUserId`
  contra la lista de personas (email); si el id no está en la lista
  (persona desactivada), muestra el identificador crudo como fallback.
  Actualiza el lead en memoria al recibir la respuesta del PATCH, sin
  recargar. Desarrollable de forma aislada con `assignableUsers` mockeado.
- **Valida:** AC-12, AC-13 (muestra error legible si el backend responde
  400), AC-14 vía `AssignmentControl.test.tsx`.
- **Dependencias:** T9, T10
- **Paralelizable:** sí

---

## T16 — Componente `ReleaseHandoffButton`
- **Dificultad:** low
- **Descripción:** Crear
  `frontend/src/components/leads/ReleaseHandoffButton.tsx`: visible solo si
  `lead.state === 'HUMAN_HANDOFF'`. Invoca `releaseLead` (`POST
  :leadId/release`, ya existente); al resolver exitosamente dispara un
  refetch puntual de `getLead` (vía callback recibido por props) para
  reflejar que el estado ya no es `HUMAN_HANDOFF`, sin recargar toda la
  página.
- **Valida:** AC-15 vía `ReleaseHandoffButton.test.tsx`.
- **Dependencias:** T10
- **Paralelizable:** sí

---

## T17 — Componentes `OptOutButton` y `SuppressLeadButton`
- **Dificultad:** medium
- **Descripción:** Crear `frontend/src/components/leads/OptOutButton.tsx`:
  invoca `optOutLead`, con confirmación breve (acción sensible pero
  reversible por el equipo); actualiza el lead en memoria con la respuesta;
  deshabilitado/oculto si el lead ya está `OPTED_OUT`. Crear
  `frontend/src/components/leads/SuppressLeadButton.tsx`: modal de
  confirmación explícita en español; el `DELETE :leadId` (`suppressLead`)
  solo se invoca tras confirmar (estado local `confirming`); nunca antes;
  tras éxito navega a `/leads`. Ambos textos, botones y mensajes en español.
  Desarrollables en paralelo entre sí y con el resto (props mockeadas).
- **Valida:** AC-16, AC-17 (reflejo del estado idempotente) vía
  `OptOutButton.test.tsx`; AC-18, AC-19 vía `SuppressLeadButton.test.tsx`.
- **Dependencias:** T10
- **Paralelizable:** sí

---

## T18 — Integración final de `LeadDetailPage` + verificación de espanol y AC-24
- **Dificultad:** medium
- **Descripción:** Ensamblar en `LeadDetailPage.tsx` todos los subcomponentes
  (T12-T17) con el estado real de `LeadDetailPage` (T11), reemplazando los
  mocks de desarrollo aislado. Revisar que todo texto/botón/mensaje de error
  o confirmación de la ficha completa esté en español (AC-23). Confirmar por
  inspección de código y test que la ficha NO expone ningún selector o
  control que permita fijar `ConversationState` a un valor arbitrario: las
  únicas transiciones manuales visibles son `ReleaseHandoffButton` (solo en
  `HUMAN_HANDOFF`) y `OptOutButton` (AC-24).
- **Valida:** AC-1 a AC-20 de forma integrada (smoke test end-to-end del
  frontend), AC-23, AC-24 vía `LeadDetailPage.test.tsx` (suite de
  integración) e inspección manual documentada en el PR.
- **Dependencias:** T11, T12, T13, T14, T15, T16, T17
- **Paralelizable:** no (última tarea del frontend, requiere todo lo demás
  terminado)

---

## Orden de ejecución sugerido

**Grupo 0 (secuencial, bloqueante para todo el backend):**
1. T1 (migración Prisma) → 2. T2 (refactor service + `findLeadOrThrow`)

**Grupo 1 (paralelo, tras T2):**
T3, T4, T5, T6, T7 — pueden ir en paralelo entre sí, cada una a un
implementer distinto (T5 requiere implementer `high`, T3/T4/T6/T7
`medium`).

**Grupo 2 (secuencial, tras Grupo 1):**
T8 (regresión multi-tenant exhaustiva sobre los 6 endpoints nuevos).

**Grupo paralelo independiente (sin esperar a nada del Grupo 0-2):**
T9 (endpoint de personas asignables) — puede arrancar desde el día 1.

**Grupo frontend — fase A (paralelo, sin esperar al backend):**
T10 (endpoints.ts), T12 (MessageTimeline), T13 (LeadNotes/NoteForm), T14
(ContactedToggle), T16 (ReleaseHandoffButton), T17 (OptOutButton/
SuppressLeadButton) pueden desarrollarse en paralelo entre sí con props/API
mockeada. T15 (AssignmentControl) depende de T9 y T10 para su contrato de
datos pero puede arrancar en paralelo apenas esos dos estén definidos.

**Grupo frontend — fase B (tras fase A):**
T11 (orquestador `LeadDetailPage`) integra la forma de datos que consumirán
los componentes; puede escribirse en paralelo con la fase A siempre que se
acuerde el contrato de props de antemano, pero su integración real depende
de T10.

**Grupo frontend — fase final (secuencial, cierra todo):**
T18 (integración + verificación español/AC-24) — depende de T11 a T17
completas. Su validación end-to-end real (no smoke con mocks) requiere que
el backend de Grupo 0-2 y T9 ya estén desplegados.

**Camino crítico:** T1 → T2 → {T3..T7} → T8, en paralelo con T9 y con todo
el frontend hasta T18, que es el único punto de sincronización final entre
ambos frentes.
