# Plan A.3: Bandeja de leads

> Producido por planner. Define COMO se construye lo que la spec (A.3) pide.

## Arquitectura

Dos frentes acoplados por el contrato HTTP de /admin/tenants/:tenantId/leads:

- Backend (medium): dos cambios aditivos y de bajo riesgo sobre el modulo
  src/admin/leads, que ya existe y ya esta protegido por
  TenantThrottlerGuard + PersonOrApiKeyGuard (A.2). No se toca schema Prisma,
  no hay migracion, no se cruza tenantId. Todo el aislamiento multi-tenant ya
  esta resuelto por el guard compuesto (rama sesion encadena TenantScopeGuard)
  y por el where filtrado por tenantId que ya usan los handlers. A.3 se apoya
  en esas garantias y NO las modifica.
  1. Nuevo GET /admin/tenants/:tenantId/leads/:leadId que devuelve la ficha
     consolidada del lead SIN mensajes.
  2. Extension de ListLeadsQueryDto + del where de list() para aceptar
     busqueda de texto libre por phone/name y filtro por multiples estados.

- Frontend (medium): primera pantalla de negocio. Nueva ruta /leads (bandeja)
  montada dentro del area autenticada (A.2), que consume listLeads ya declarado
  como stub en endpoints.ts, mas una ruta placeholder de detalle /leads/:leadId
  (destino real es A.4). Reusa useApi, Spinner, ErrorBanner, AuthContext,
  ProtectedRoute y AppLayout de A.2.

Flujo: LeadsPage usa useApi -> listLeads(tenantId, {states, q, page}, token) ->
GET /admin/tenants/:tenantId/leads?state=A&state=B&q=...&page=n -> backend where
{ tenantId, state:{in}, OR:[phone contains, name contains] }, orderBy
lastMessageAt desc, skip/take 20. Cada fila (LeadRow con LeadChips) navega a
/leads/:leadId (LeadDetailPage placeholder, A.4).

## Entidades / modulos afectados

### Backend

- src/admin/leads/list-leads-query.dto.ts (modifica): agrega q?: string
  (busqueda) y cambia state de ConversationState unico a state?:
  ConversationState[] (acepta multiples estados).
- src/admin/leads/admin-leads.controller.ts (modifica): (a) construye el where
  combinando tenantId + filtro state (ahora { in }) + OR de phone/name contains
  insensitive; (b) nuevo handler getOne(":leadId") que devuelve la ficha sin
  mensajes.
- e2e del modulo leads (modifica/crea): busqueda por phone/name, combinacion
  state+q, filtro multi-estado, detalle 200, detalle 404 cross-tenant,
  cross-tenant 403 (regresion A.2).

No se modifica prisma/schema.prisma (sin migracion). No se agregan providers ni
cambia admin.module.ts.

### Frontend (nuevo, en frontend/)

- src/api/endpoints.ts (modifica): corrige el enum ConversationState (el stub
  actual esta MAL, ver Riesgos), tipa Lead real, extiende ListLeadsQuery con q y
  state: ConversationState[], y listLeads serializa el array como parametros
  repetidos. Agrega getLead(tenantId, leadId, token) para el nuevo endpoint.
- src/routes/LeadsPage.tsx (crea): orquesta filtro+busqueda+paginacion; llama
  listLeads via useApi; renderiza carga/error/lista.
- src/components/leads/LeadStateFilter.tsx (crea): selector de las 5 categorias
  de UI + Todas; traduce categoria a array de ConversationState.
- src/components/leads/LeadSearchInput.tsx (crea): input de texto con debounce
  local; emite el termino q.
- src/components/leads/LeadsList.tsx + LeadRow.tsx (crea): lista de filas; cada
  fila es un Link/click a /leads/:leadId.
- src/components/leads/LeadChips.tsx (crea): deriva chips legibles en espanol
  solo de los filtros presentes.
- src/components/Pagination.tsx (crea): control siguiente/anterior a partir de
  total/page/pageSize (generico, reusable en A.4/A.5).
- src/routes/LeadDetailPage.tsx (crea, placeholder): renderiza leadId + aviso
  "Detalle en construccion (A.4)". Ocupa la ruta para AC-13.
- src/App.tsx (modifica): cablea el router (hoy scaffold): /login, y bajo
  ProtectedRoute+AppLayout las rutas /leads (index) y /leads/:leadId.
- src/routes/AppLayout.tsx (modifica): agrega link Leads en la nav (visible a
  OWNER y AGENT).
- Tests *.test.tsx de los componentes nuevos (crea): mapeo de estados, render de
  chips condicional, paginacion, estados carga/error.

## Decisiones tecnicas

### Backend

- GET /leads/:leadId con findFirst por { id, tenantId } y 404 unificado. Es el
  mismo patron que ya usan messages(), release() y suppress() en el controller:
  filtrar por id Y tenantId en la misma query. Asi un lead de otro tenant es
  indistinguible de uno inexistente: ambos devuelven 404 (NotFoundException
  "Lead no encontrado"), sin filtrar por id primero y comparar tenant despues
  (eso abriria un oraculo de existencia cross-tenant). Cubre AC-6 y AC-7. El 403
  cross-tenant de nivel URL (AC-14) lo sigue dando TenantScopeGuard antes de
  llegar al handler.

- La ficha NO expone el timeline: se devuelve el registro Lead tal cual, sin
  include de messages. El endpoint hace un unico findFirst sobre la tabla Lead
  (una fila, por PK+tenant, sin joins): no hay N+1 posible y no se toca la tabla
  Message. El timeline sigue siendo responsabilidad de .../messages (A.4). Shape
  de respuesta (todos los campos del modelo Lead que la spec enumera; se devuelve
  el objeto Prisma directo para no duplicar un mapper, igual que hoy hacen
  list()/messages()): id, phone, name, state, fOperation, fNeighborhoods,
  fMaxPrice, fCurrency, fMinRooms, fGarage, fPetsAllowed, fNotes, lastMessageAt,
  handoffAt, optedOutAt, createdAt. Nota: Lead incluye ademas fPreferredDay,
  fOfferedNeighborhoods y campos internos de turnos; se devuelve el objeto
  completo (consistente con list(), que hoy retorna findMany sin select). El
  frontend consume solo los campos que la spec pide y NO renderiza los internos.
  Si se quisiera acotar la superficie, se agregaria un select explicito: anotado
  como mejora, no requerido por los AC.

- Busqueda: parametro q con OR entre phone contains y name contains, mode
  insensitive. Postgres + Prisma soportan contains con mode insensitive
  nativamente. Se elige q (no search) porque search en Prisma tiene semantica
  reservada de full-text (_search), y aca queremos substring simple, no FTS. El
  filtro se combina por AND con tenantId y con el filtro de estado a nivel raiz
  del where. Cubre AC-5. Sin indice nuevo: el volumen por tenant es chico
  (bandeja de una inmobiliaria) y un ILIKE de substring no usa indice B-tree
  igual; un indice trigram es optimizacion prematura fuera de alcance.

- state pasa de valor unico a array (state?: ConversationState[]) y el where usa
  { state: { in: query.state } }. Esta es la decision que habilita la categoria
  de UI Nuevo/calificando, que agrupa DOS estados reales (GREETING +
  QUALIFICATION) en una sola llamada. El DTO actual solo acepta un
  ConversationState; con el, "nuevo" exigiria dos requests y un merge
  client-side, lo que rompe la paginacion (dos paginados independientes no se
  combinan en 20 por pagina) y contradice AC-2/AC-4 (en la misma llamada, la
  interseccion la calcula el backend). Por eso se extiende el backend a aceptar
  un array. Implementacion del DTO: IsOptional, IsEnum con { each: true } y un
  Transform que normalice tanto ?state=A&state=B (repetido, lo que emite
  URLSearchParams) como un solo ?state=A a array. Si state viene vacio/ausente:
  no se agrega filtro (todas las categorias). Alternativa descartada: mantener
  single-state y hacer merge en frontend (rompe paginacion y viola los AC).

### Mapeo de las 5 categorias de UI a los 6 ConversationState

Los 6 estados reales del enum son: GREETING, QUALIFICATION, SEARCH_MATCH,
SCHEDULING, HUMAN_HANDOFF, OPTED_OUT. Se agrupan en 5 categorias de UI (mas una
opcion Todas que no envia filtro):

| Categoria UI (etiqueta espanol) | Estados reales enviados al backend |
| --- | --- |
| Nuevo / calificando | GREETING, QUALIFICATION |
| En busqueda | SEARCH_MATCH |
| Agendo visita | SCHEDULING |
| Atencion humana | HUMAN_HANDOFF |
| Dado de baja | OPTED_OUT |
| (Todas) | (sin parametro state) |

Justificacion del agrupamiento:
- GREETING + QUALIFICATION = Nuevo/calificando: ambos representan un lead que
  todavia no tiene busqueda cerrada; desde la optica del asesor son el mismo cubo
  de "recien entro / lo estoy calificando". Es la unica categoria que mapea a 2
  estados, y por eso motiva el state[] en el backend.
- SEARCH_MATCH va solo en En busqueda: el lead ya tiene filtros y esta viendo
  propiedades; es un estado accionable distinto de "recien entro". No se fusiona
  con Nuevo para que el asesor distinga a quien ya se le mostro oferta.
- SCHEDULING, HUMAN_HANDOFF, OPTED_OUT son 1:1 con categorias, porque cada uno
  dispara una accion/atencion distinta del asesor (visita, tomar la charla, no
  contactar).
- No se inventan estados: "agendo" es exactamente SCHEDULING (la spec ya aclara
  que un estado agendo literal distinto seria otra spec). El fuera-de-alcance de
  la spec queda respetado.

El mapeo vive en el frontend (LeadStateFilter -> constante UI_STATE_GROUPS:
Record<UiCategory, ConversationState[]>). El backend permanece agnostico de las
categorias de UI: solo conoce estados reales.

### Frontend

- Corregir endpoints.ts antes de consumirlo. El stub actual declara
  ConversationState = QUALIFICATION | SEARCH | PRESENTING | SCHEDULING |
  HUMAN_HANDOFF | OPTED_OUT | CLOSED, que NO coincide con el enum real (GREETING
  | QUALIFICATION | SEARCH_MATCH | SCHEDULING | HUMAN_HANDOFF | OPTED_OUT).
  Consumir el stub tal cual haria que el filtro envie estados inexistentes
  (SEARCH, PRESENTING, CLOSED) y omita reales (GREETING, SEARCH_MATCH): el
  backend con IsEnum rechazaria con 400. Se corrige el tipo y se tipa Lead
  calcado del schema. Es un fix de contrato, no una feature.

- Una sola llamada al backend por cambio de filtro/busqueda/pagina (server-side).
  LeadsPage mantiene un estado { category, q, page } y dispara listLeads cada vez
  que cambia cualquiera de los tres, reseteando page a 1 cuando cambia category o
  q (cambiar el filtro y quedarse en page 5 daria una pagina vacia). No se filtra
  ni pagina client-side sobre una lista traida (AC-2/3/4 exigen que la
  interseccion la calcule el backend). Busqueda con debounce local (~350ms) en
  LeadSearchInput para no disparar una request por tecla; el debounce es de UI,
  no cambia que la consulta sea server-side.

- LeadChips deriva chips solo de campos presentes, sin placeholders de negocio.
  Reglas de render (AC-8/AC-9):
  - fOperation presente -> chip Venta/Alquiler (traduccion de OperationType).
  - fNeighborhoods array no vacio -> un chip por barrio (o "Barrios: a, b").
  - fMaxPrice presente Y fCurrency presente -> chip "Hasta {currency} {price}".
    Si falta fMaxPrice, no hay chip de presupuesto aunque haya moneda.
  - fMinRooms presente -> chip "{n}+ ambientes".
  - fGarage/fPetsAllowed (opcionales, no exigidos por la spec para la bandeja):
    se pueden mostrar como chip solo si son true; se omiten en A.3 si complican,
    quedan para A.4. Se prioriza mostrar los 4 que la spec pide.
  Un campo null/array vacio -> no renderiza chip. "Sin datos cargados" como texto
  fijo de UI esta permitido si el lead no tiene NINGUN filtro, pero nunca un
  valor de negocio inventado.

- Pagination generico a partir de total/page/pageSize. El backend ya devuelve
  esos tres campos; Pagination calcula totalPages = ceil(total/pageSize) y
  habilita/deshabilita anterior/siguiente. Se extrae como componente reusable
  porque A.4/A.5 (propiedades) van a paginar igual. Cubre AC-12.

- Ruta de detalle placeholder /leads/:leadId. A.4 no existe todavia, pero AC-13
  exige que el click navegue a una ruta de detalle. Se crea LeadDetailPage que
  lee useParams().leadId y renderiza un placeholder ("Ficha del lead, en
  construccion, A.4") sin llamar a la API todavia. Asi la navegacion es real y
  A.4 solo reemplaza el contenido de esa ruta. Alternativa descartada: navegar a
  una ruta inexistente (rompe a un 404 del router).

- Cableado del router en App.tsx (hoy scaffold). A.2 creo ProtectedRoute,
  AppLayout, LoginPage, PeoplePage pero App.tsx sigue siendo un placeholder sin
  Routes. A.3 conecta el router (react-router-dom ya esta en el arbol; AppLayout
  importa Link/Outlet/useNavigate): /login publico; bajo ProtectedRoute ->
  AppLayout con Outlet -> / (redirect a /leads), /leads, /leads/:leadId, /people
  (OWNER). Si A.2 ya lo hubiera cableado parcialmente, A.3 solo agrega las dos
  rutas de leads; el plan asume el estado actual (scaffold) y lo completa.

## Riesgos y edge cases

- [Contrato] El enum ConversationState del stub endpoints.ts es incorrecto (ver
  decision de frontend). Riesgo alto si se ignora: filtros que el backend rechaza
  con 400. Mitigacion: corregirlo como primer paso y tiparlo desde el enum real;
  idealmente un test que verifique que las categorias de UI solo emiten valores
  del enum real.
- Multi-estado en query string. URLSearchParams con append de state dos veces
  produce ?state=A&state=B; NestJS/Express parsea eso como array solo si el DTO
  lo transforma. Hay que garantizar en el DTO que un unico state tambien se
  normalice a array (Array.isArray(v) ? v : [v]) para no romper el { in }.
  Cubierto por e2e con uno y con dos estados.
- Reset de pagina al cambiar filtro/busqueda. Cambiar de categoria estando en
  page > 1 puede pedir una pagina fuera de rango: el backend devuelve leads vacio
  con total chico. La UI debe distinguir "pagina vacia por filtro" de "sin
  resultados". Mitigacion: resetear page=1 en todo cambio de category/q.
- Lista vacia vs error (AC-11). useApi distingue error != null de
  data.leads.length === 0. La bandeja renderiza tres estados mutuamente
  excluyentes: cargando (Spinner), error (ErrorBanner en espanol), y vacio ("No
  hay leads para este filtro"). Nunca una lista vacia silenciosa ante error.
- Busqueda con comodines SQL (% y _) en q. Prisma contains parametriza el valor
  (no interpola), asi que un % que escriba el usuario se trata como literal: sin
  riesgo de inyeccion. Si conviene trim() del termino en el frontend para no
  disparar busqueda con solo espacios.
- Performance del ILIKE de substring. No usa indice, pero el conjunto por tenant
  es acotado (una inmobiliaria). Aceptable para A.3; indice trigram queda como
  optimizacion futura si el volumen crece. No es superficie critica.
- Aislamiento multi-tenant (critico, ya vigente). A.3 NO introduce ninguna query
  cross-tenant: todo handler filtra por el tenantId del Param, ya autorizado por
  PersonOrApiKeyGuard+TenantScopeGuard (A.2). El 404 unificado del detalle evita
  el oraculo de existencia. Se agrega e2e de regresion cross-tenant (AC-14) para
  blindar que el cambio no abrio una fuga.
- fMaxPrice es Decimal de Prisma: se serializa a string en JSON. El frontend debe
  formatearlo como numero/moneda tratandolo como string, sin asumir number (parse
  defensivo). El chip de presupuesto lo contempla.

## Trazabilidad

- AC-1 -> LeadsPage monta y llama listLeads(tenantId, {}, token) con el tenantId
  de AuthContext; renderiza leads en el orden recibido, sin reordenar (backend ya
  ordena por lastMessageAt desc).
- AC-2 -> LeadStateFilter traduce la categoria a ConversationState[] via
  UI_STATE_GROUPS y re-dispara listLeads con state.
- AC-3 -> LeadSearchInput (debounce) emite q; LeadsPage re-dispara con el
  parametro; backend filtra phone/name contains insensitive.
- AC-4 -> LeadsPage mantiene category y q juntos y los envia en la misma llamada;
  el backend combina state { in } + OR por AND.
- AC-5 -> controller arma where con tenantId, state { in } y OR de phone contains
  insensitive y name contains insensitive.
- AC-6 -> nuevo getOne devuelve el Lead con sus f* sin messages.
- AC-7 -> findFirst por { id, tenantId } -> 404 si no existe o es de otro tenant,
  indistinguibles.
- AC-8 -> LeadChips renderiza un chip por cada f* presente.
- AC-9 -> LeadChips omite el chip de cada f* null/vacio; sin valores inventados.
- AC-10 -> useApi.loading -> Spinner en la bandeja.
- AC-11 -> useApi.error -> ErrorBanner en espanol, estado distinto de vacio.
- AC-12 -> Pagination con total/page/pageSize; navega cambiando page.
- AC-13 -> LeadRow es Link/onClick a /leads/:leadId; ruta placeholder existe.
- AC-14 -> TenantScopeGuard (A.2) rechaza con 403 tenant ajeno en la URL, tanto
  en list como en getOne; e2e de regresion.
- AC-15 -> todas las etiquetas (categorias, chips, errores, vacio, encabezados)
  hardcodeadas en espanol.

## Aprobaciones pendientes

> Todas aprobadas por el usuario (2026-07-23), tal como las proponía el plan.

1. **APROBADO:** Extender ListLeadsQueryDto: state unico -> state?:
   ConversationState[] (para la categoria Nuevo/calificando = GREETING+
   QUALIFICATION en una sola llamada, sin merge client-side).
2. **APROBADO:** Nombre del parametro de busqueda: `q` (no `search`), con
   contains + mode insensitive sobre phone O name.
3. **APROBADO:** Mapeo de las 5 categorias de UI a los 6 estados tal como
   propone la tabla de Decisiones tecnicas, con SEARCH_MATCH como categoria
   propia "En busqueda", separada de "Nuevo/calificando".
4. **APROBADO:** Correccion del enum ConversationState en endpoints.ts dentro
   de A.3 (fix de contrato, bug latente de A.2).
