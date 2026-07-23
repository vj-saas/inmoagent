# Tasks — A.3 Bandeja de leads

> Producido por task-splitter a partir de spec.md y plan.md (ambos aprobados
> 2026-07-23). Dificultad asignada según los criterios de low/medium/high de
> CLAUDE.md del proyecto.

## Nota sobre clasificación backend (medium vs high)

CLAUDE.md marca como **high** "cualquier query que cruce o resuelva `tenantId`"
y como **medium** "endpoints de lectura filtrados por `tenantId`". Las tres
tareas de backend de esta spec (T1–T3):

- No agregan ninguna lógica nueva de **resolución** de tenant (eso es lo que
  hace `TenantScopeGuard`/`PersonOrApiKeyGuard`, ya existente desde A.2 y sin
  tocar en A.3).
- No **cruzan** tenants: tanto `list()` como el nuevo `getOne()` arman su
  `where`/`findFirst` con `tenantId` en la raíz, exactamente el mismo patrón
  que ya usan `messages()`, `release()` y `suppress()` en el controller
  actual. El detalle usa `findFirst({ id, tenantId })` con 404 unificado, sin
  primero buscar por `id` y comparar tenant después (eso sí sería un oráculo
  cross-tenant y calificaría como high).
- Son extensiones aditivas de un `where`/DTO ya filtrado, no lógica nueva de
  aislamiento.

Por lo tanto quedan en **medium**, tal como las clasifica el propio plan
("Backend (medium): ... no se cruza tenantId ... el aislamiento ya está
resuelto por el guard compuesto"). Si alguna de estas tareas terminara
tocando el guard, agregando un `findFirst` por `id` solo (sin `tenantId` en
la misma query) o cualquier lógica que decida a qué tenant pertenece algo,
sube a **high** de inmediato y hay que re-clasificarla antes de despachar.

---

## Backend

### T1 — Extender `ListLeadsQueryDto`: `q` y `state` como array
- **Dificultad:** medium (ver nota arriba; DTO con `class-validator`, sin
  resolución ni cruce de tenant)
- **Descripción:** en `src/admin/leads/list-leads-query.dto.ts`, agregar
  `q?: string` (búsqueda de texto libre) y cambiar `state` de
  `ConversationState` único a `state?: ConversationState[]`, con
  `@IsOptional()`, `@IsEnum(ConversationState, { each: true })` y un
  `@Transform` que normalice tanto `?state=A` (string único) como
  `?state=A&state=B` (array, lo que emite `URLSearchParams.append`) a un
  array uniforme. Si `state` viene ausente/vacío, no se agrega filtro.
- **Valida:** AC-2, AC-4, AC-5 vía tests unitarios/e2e del DTO (normalización
  single→array y array de 2 elementos) — cubiertos en T4.
- **Dependencias:** ninguna
- **Paralelizable:** sí (junto con T5–T11 del frontend, que no dependen del
  backend para su desarrollo, aunque sí para integración real)

### T2 — Extender el `where` de `GET /admin/tenants/:tenantId/leads`
- **Dificultad:** medium (ver nota arriba: extensión aditiva de un `where` ya
  filtrado por `tenantId`, mismo patrón que los handlers existentes)
- **Descripción:** en `admin-leads.controller.ts`, el handler `list()` arma el
  `where` combinando `tenantId` (ya existente) + `state: { in: query.state }`
  (si viene) + `OR: [{ phone: { contains: q, mode: 'insensitive' } }, { name:
  { contains: q, mode: 'insensitive' } }]` (si `q` viene), todo combinado por
  AND a nivel raíz. No se toca el `orderBy` (sigue fijo por `lastMessageAt`
  desc) ni la paginación existente.
- **Valida:** AC-2, AC-4, AC-5 vía `test/leads.e2e-spec.ts` (o el archivo e2e
  del módulo) — casos de búsqueda por phone/name, combinación state+q, y
  filtro multi-estado (T4 los escribe).
- **Dependencias:** T1
- **Paralelizable:** no (secuencial respecto a T1; en paralelo con frontend)

### T3 — Nuevo endpoint `GET /admin/tenants/:tenantId/leads/:leadId`
- **Dificultad:** medium (ver nota arriba: `findFirst({ id, tenantId })` con
  404 unificado, mismo patrón de `messages()`/`release()`/`suppress()`)
- **Descripción:** nuevo handler `getOne()` en `admin-leads.controller.ts`
  protegido por los mismos guards del módulo (`TenantThrottlerGuard`,
  `PersonOrApiKeyGuard`). Hace un único `findFirst` por `{ id: leadId,
  tenantId }` sobre la tabla `Lead` sin `include` de `messages`. Si no
  encuentra el registro (no existe o pertenece a otro tenant), responde 404
  con `NotFoundException('Lead no encontrado')` — nunca busca por `id` solo y
  compara tenant después. Devuelve el objeto Prisma completo (mismo criterio
  que `list()`, sin mapper ni `select` acotado).
- **Valida:** AC-6, AC-7 vía `test/leads.e2e-spec.ts` (detalle 200 con campos
  esperados sin `messages`, detalle 404 con lead inexistente, detalle 404 con
  lead de otro tenant).
- **Dependencias:** ninguna (independiente de T1/T2, mismo archivo pero
  handler distinto)
- **Paralelizable:** sí (con T1/T2, cuidando conflicto de merge en el mismo
  archivo; no en paralelo si el mismo implementer toma T2 y T3 a la vez sobre
  el controller — recomendable secuenciar T2→T3 o T3→T2 si es un solo
  implementer, o coordinar merge si son dos)

### T4 — Tests e2e del módulo leads (búsqueda, multi-estado, detalle, regresión cross-tenant)
- **Dificultad:** medium (tests de endpoints de lectura filtrados por
  `tenantId`; la regresión cross-tenant valida un guard ya existente, no
  agrega lógica nueva de aislamiento)
- **Descripción:** en el e2e del módulo leads, agregar/extender casos: (a)
  búsqueda por `phone` contiene término, (b) búsqueda por `name` contiene
  término (case-insensitive), (c) combinación `state` + `q` en una sola
  llamada, (d) filtro con dos estados (`?state=A&state=B`), (e) detalle 200
  con todos los campos `f*` y sin `messages`, (f) detalle 404 con `leadId`
  inexistente, (g) detalle 404 con `leadId` de otro tenant, (h) regresión:
  `GET .../leads` y `GET .../leads/:leadId` con `tenantId` de otro tenant en
  la URL responden 403 (AC-14, guard ya vigente de A.2).
- **Valida:** AC-2, AC-4, AC-5, AC-6, AC-7, AC-14
- **Dependencias:** T1, T2, T3
- **Paralelizable:** no (requiere que T1–T3 estén terminadas)

---

## Frontend

### T5 — Fix del enum `ConversationState` y tipado real en `endpoints.ts`
- **Dificultad:** medium (fix de contrato que afecta directamente qué
  parámetros válidos puede enviar toda la bandeja; el plan lo marca como
  riesgo alto si se ignora, pero es un cambio de tipos/serialización sin
  lógica de negocio compleja — no toca `tenantId` ni FSM/guardrails)
- **Descripción:** en `frontend/src/api/endpoints.ts`, corregir
  `ConversationState` para que coincida con el enum real del backend
  (`GREETING | QUALIFICATION | SEARCH_MATCH | SCHEDULING | HUMAN_HANDOFF |
  OPTED_OUT`, eliminando `SEARCH`, `PRESENTING`, `CLOSED` inexistentes).
  Tipar `Lead` calcado del modelo Prisma (incluye `f*`). Extender
  `ListLeadsQuery` con `q?: string` y `state?: ConversationState[]`.
  `listLeads` debe serializar `state` como parámetros repetidos
  (`URLSearchParams.append` por cada estado). Agregar
  `getLead(tenantId, leadId, token)` para el nuevo endpoint de detalle.
- **Valida:** AC-1, AC-2, AC-3, AC-4, AC-6 (indirectamente: sin este fix
  cualquier llamada con estados reales como `GREETING`/`SEARCH_MATCH` sería
  imposible de tipar correctamente) — cubierto por tests unitarios de
  serialización en T15.
- **Dependencias:** ninguna
- **Paralelizable:** sí (bloqueante para T8, T12 que lo consumen, pero puede
  arrancar en paralelo con el resto del frontend y con backend)

### T6 — `Pagination.tsx` (componente genérico)
- **Dificultad:** low (componente de presentación puro, sin lógica de
  negocio, reusable)
- **Descripción:** crear `frontend/src/components/Pagination.tsx` que reciba
  `total`, `page`, `pageSize` y un callback `onPageChange`, calcule
  `totalPages = ceil(total/pageSize)` y habilite/deshabilite
  anterior/siguiente según corresponda. Textos en español.
- **Valida:** AC-12
- **Dependencias:** ninguna
- **Paralelizable:** sí

### T7 — `LeadChips.tsx`
- **Dificultad:** medium (lógica de mapeo de datos de negocio a texto legible,
  con reglas condicionales por campo; no es solo estilo)
- **Descripción:** crear `frontend/src/components/leads/LeadChips.tsx` que
  derive chips en español solo de campos presentes en el lead: `fOperation`
  (Venta/Alquiler), `fNeighborhoods` (uno o varios barrios), `fMaxPrice` +
  `fCurrency` juntos (si falta `fMaxPrice`, no hay chip aunque haya moneda),
  `fMinRooms` ("{n}+ ambientes"). `fMaxPrice` llega como string (Decimal
  serializado): parsear defensivamente sin asumir `number`. Ningún campo
  `null`/array vacío genera chip ni placeholder de negocio inventado.
- **Valida:** AC-8, AC-9 vía tests de componente (T15)
- **Dependencias:** ninguna
- **Paralelizable:** sí

### T8 — `LeadStateFilter.tsx`
- **Dificultad:** medium (implementa el mapeo de negocio de 5 categorías de
  UI a los 6 `ConversationState` reales, acordado y aprobado en el plan;
  errores acá rompen AC-2 silenciosamente)
- **Descripción:** crear `frontend/src/components/leads/LeadStateFilter.tsx`
  con la constante `UI_STATE_GROUPS: Record<UiCategory, ConversationState[]>`
  según la tabla aprobada (Nuevo/calificando → GREETING+QUALIFICATION; En
  búsqueda → SEARCH_MATCH; Agendó visita → SCHEDULING; Atención humana →
  HUMAN_HANDOFF; Dado de baja → OPTED_OUT; Todas → sin parámetro). Selector
  en español que emite el array de estados correspondiente al elegir una
  categoría.
- **Valida:** AC-2
- **Dependencias:** T5 (necesita el enum `ConversationState` correcto)
- **Paralelizable:** no (depende de T5); en paralelo con T6, T7, T9, T10, T11

### T9 — `LeadSearchInput.tsx`
- **Dificultad:** low (input controlado con debounce local, sin lógica de
  negocio más allá de emitir un string)
- **Descripción:** crear `frontend/src/components/leads/LeadSearchInput.tsx`,
  input de texto con debounce (~350ms) que emite el término `q` (recomendable
  `trim()` para no disparar búsqueda con solo espacios). Placeholder en
  español.
- **Valida:** AC-3
- **Dependencias:** ninguna
- **Paralelizable:** sí

### T10 — `LeadsList.tsx` + `LeadRow.tsx`
- **Dificultad:** low (lista y fila de presentación; la navegación es un
  `Link` estándar, sin lógica de negocio)
- **Descripción:** crear `frontend/src/components/leads/LeadsList.tsx` (itera
  leads recibidos, sin reordenar ni filtrar client-side) y `LeadRow.tsx` (cada
  fila es un `Link`/click hacia `/leads/:leadId`, integra `LeadChips` por
  fila).
- **Valida:** AC-1, AC-13 (navegación); integra AC-8/AC-9 vía `LeadChips`
- **Dependencias:** T7 (LeadChips)
- **Paralelizable:** no (depende de T7); en paralelo con T6, T8, T9, T11

### T11 — `LeadDetailPage.tsx` (placeholder)
- **Dificultad:** low (placeholder sin llamadas a API ni lógica)
- **Descripción:** crear `frontend/src/routes/LeadDetailPage.tsx` que lea
  `useParams().leadId` y renderice un aviso fijo en español ("Ficha del lead
  en construcción, disponible en la próxima fase") con el `leadId`. No llama
  a `getLead` todavía (A.4 lo hará).
- **Valida:** AC-13 (ruta de destino existe y es navegable)
- **Dependencias:** ninguna
- **Paralelizable:** sí

### T12 — `LeadsPage.tsx` (orquestación)
- **Dificultad:** medium (combina filtro + búsqueda + paginación en una sola
  consulta server-side, con reglas de reset de página; lógica de negocio de
  la pantalla, no CRUD trivial)
- **Descripción:** crear `frontend/src/routes/LeadsPage.tsx`. Mantiene estado
  `{ category, q, page }`; llama `listLeads(tenantId, { state, q, page },
  token)` vía `useApi` cada vez que cambia cualquiera de los tres; resetea
  `page = 1` cuando cambia `category` o `q` (nunca al cambiar solo `page`).
  Renderiza: `Spinner` mientras `loading`, `ErrorBanner` en español si
  `error` (nunca una lista vacía indistinguible de error), lista vacía con
  mensaje fijo ("No hay leads para este filtro") si `data.leads.length ===
  0` y no hay error, o `LeadsList` + `Pagination` con los datos. Usa
  `tenantId` de `AuthContext` (A.2), nunca inventado ni de otra fuente.
- **Valida:** AC-1, AC-2, AC-3, AC-4, AC-10, AC-11, AC-12
- **Dependencias:** T5, T6, T7, T8, T9, T10
- **Paralelizable:** no (integra todos los componentes anteriores)

### T13 — Cableado de rutas en `App.tsx`
- **Dificultad:** medium (conecta el router real por primera vez sobre un
  scaffold; afecta todas las rutas protegidas de A.2 además de las nuevas, no
  es un cambio trivial de una línea)
- **Descripción:** en `frontend/src/App.tsx`, completar el `Routes`: `/login`
  público; bajo `ProtectedRoute` + `AppLayout` (con `Outlet`): `/` (redirect a
  `/leads`), `/leads` (index → `LeadsPage`), `/leads/:leadId` →
  `LeadDetailPage`, `/people` (OWNER, ya de A.2 si existía parcialmente). Si
  A.2 ya cableó algo, esta tarea solo agrega las rutas de leads sin romper lo
  existente.
- **Valida:** AC-13 (la navegación real requiere que la ruta exista montada)
- **Dependencias:** T11, T12
- **Paralelizable:** no

### T14 — Link "Leads" en `AppLayout`
- **Dificultad:** low (agregar un link de navegación, copy en español)
- **Descripción:** en `frontend/src/routes/AppLayout.tsx`, agregar un
  `Link`/item de nav hacia `/leads`, visible para roles `OWNER` y `AGENT`.
- **Valida:** AC-1 (acceso a la pantalla desde el layout autenticado, según
  spec "accesible desde el layout autenticado")
- **Dependencias:** ninguna (puede ir en paralelo, pero la ruta debe existir
  para probarse end-to-end — no bloquea el desarrollo del link en sí)
- **Paralelizable:** sí

### T15 — Tests de componentes frontend
- **Dificultad:** medium (cubre lógica de mapeo de estados, render
  condicional de chips, y estados de carga/error — no son solo snapshots)
- **Descripción:** tests `*.test.tsx` para: `LeadStateFilter` (cada categoría
  de UI emite exactamente los `ConversationState` reales esperados, ninguno
  inventado), `LeadChips` (chip presente/ausente según campo `null`/vacío,
  parseo de `fMaxPrice` string), `Pagination` (habilitación de
  anterior/siguiente según `total`/`page`/`pageSize`), `LeadsPage` (estados
  de carga, error y vacío mutuamente excluyentes; reset de `page` al cambiar
  filtro/búsqueda), serialización de `state[]` en `listLeads` (T5).
- **Valida:** AC-2, AC-5 (serialización), AC-8, AC-9, AC-10, AC-11, AC-12,
  AC-15 (verificar textos en español en los mensajes de error/vacío/chips)
- **Dependencias:** T5, T6, T7, T8, T12
- **Paralelizable:** no (requiere los componentes terminados)

---

## Hueco de cobertura a resolver

- **AC-15** (todo en español) no tiene una tarea dedicada de verificación
  global: queda cubierto parcialmente por revisión manual/lint de copys en
  cada tarea de UI (T6–T14) y por las aserciones de texto en T15. Si se
  quiere blindar con un test explícito de "no strings en inglés visibles",
  agregar una tarea adicional de QA/lint antes de cerrar la fase; no
  bloqueante para el resto del plan.

---

## Orden de ejecución sugerido

**Grupo 1 (paralelo, sin dependencias):**
T1 (DTO), T3 (endpoint detalle), T5 (fix enum + tipos), T6 (Pagination), T7
(LeadChips), T9 (LeadSearchInput), T11 (LeadDetailPage placeholder), T14
(link nav).

> Nota: T1/T2/T3 tocan el mismo controller — si un solo implementer las
> toma, hacerlas en secuencia (T1 → T2, T3 en paralelo o intercalado) para
> evitar conflictos de merge; si son implementers distintos, coordinar el
> merge del archivo `admin-leads.controller.ts`.

**Grupo 2 (secuencial sobre Grupo 1):**
- T2 (where extendido) — depende de T1.
- T8 (LeadStateFilter) — depende de T5.
- T10 (LeadsList/LeadRow) — depende de T7.

**Grupo 3 (secuencial):**
- T4 (e2e backend) — depende de T1, T2, T3.
- T12 (LeadsPage) — depende de T5, T6, T7, T8, T9, T10.

**Grupo 4 (secuencial, cierre):**
- T13 (routing App.tsx) — depende de T11, T12.
- T15 (tests de componentes) — depende de T5, T6, T7, T8, T12.

**Cierre de fase:** T4 y T13/T15 no tienen dependencia cruzada entre sí
(backend y frontend pueden cerrar en paralelo una vez completos sus
respectivos grupos previos), pero ambos deben estar verdes antes de dar la
spec por completa, dado que AC-2/AC-4/AC-5 requieren integración real
frontend-backend (no solo mocks) para considerarse validados end-to-end.
</content>
