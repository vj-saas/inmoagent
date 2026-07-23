# Plan A.2: Frontend base (login, sesion, layout, capa HTTP) + apertura aditiva de guards

> Producido por planner. Define COMO se construye lo que la spec pide.

## Arquitectura

Dos frentes: uno chico de backend y uno nuevo de frontend, unidos por el contrato
HTTP ya existente de A.1.

### Backend - apertura aditiva de leads / metrics / properties

Hoy los tres controllers de src/admin protegen con
@UseGuards(TenantThrottlerGuard, TenantApiKeyGuard). En NestJS los guards de un
mismo @UseGuards son AND (todos deben pasar), asi que no se puede sumar
PersonSessionGuard en la misma lista sin romper el camino API key (una request
con sesion pero sin X-Api-Key fallaria en TenantApiKeyGuard, y viceversa).

La solucion es un guard compuesto con semantica OR: un unico PersonOrApiKeyGuard
que, dentro de su canActivate, elige el mecanismo segun los headers presentes y
delega en el guard correspondiente, autorizando si cualquiera de los dos valida.
Reemplaza a TenantApiKeyGuard en el UseGuards de los tres controllers (queda
UseGuards con TenantThrottlerGuard + PersonOrApiKeyGuard).

Diagrama del guard compuesto (rama por header):

- TenantThrottlerGuard: sin cambios; throttle por tenant/IP.
- PersonOrApiKeyGuard (NUEVO, OR):
  - hay header X-Api-Key -> delega en TenantApiKeyGuard.canActivate
    (camino server-to-server actual, intacto - AC-18).
  - hay header Authorization Bearer -> delega en PersonSessionGuard.canActivate
    y LUEGO en TenantScopeGuard.canActivate
    (person.tenantId === el :tenantId de la ruta, si no coincide 403 - AC-19).
  - ninguno de los dos -> 401.
- Handler: SIN cambios. Ya filtra por el Param tenantId, no lee request.tenant.

Clave de por que el cambio es de bajo riesgo: los handlers de estos controllers
NO leen request.tenant. Toman el tenantId del parametro de ruta y filtran los
servicios por ese valor. Por eso da igual cual de los dos guards autorizo: el
aislamiento por parametro de URL ya esta, y el guard compuesto garantiza que ese
tenantId fue autorizado (por API key de ese tenant, o por sesion de una persona
de ese tenant via TenantScopeGuard). No hace falta tocar servicios ni DTOs.

### Frontend - SPA nueva en carpeta hermana del backend

Proyecto Vite + React + TypeScript nuevo en frontend/ dentro del mismo repo
(monorepo liviano, sin workspaces). App puramente cliente que consume la API del
backend por HTTP. Capas:

- frontend/src/api/       capa HTTP centralizada (fetch wrapper + endpoints tipados)
- frontend/src/auth/      AuthContext, persistencia de sesion, ProtectedRoute
- frontend/src/routes/    paginas: Login, area autenticada (layout + placeholders)
- frontend/src/components/ UI reutilizable: Spinner, ErrorBanner, etc.

Flujo de sesion en el cliente:

1. Login page llama api.login(email, password) -> { token }.
2. Guarda { token, role, tenantId } en sessionStorage + AuthContext.
3. Rutas protegidas: ProtectedRoute redirige a /login si no hay sesion.
4. Cada request autenticada: el wrapper agrega Authorization: Bearer token.
5. Si el backend responde 401: limpia sesion + redirect /login (AC-6).
6. Logout: api.logout() -> limpia sesion -> /login.

## Entidades / modulos afectados

### Backend

| Archivo / modulo | Se crea o modifica | Que cambia |
| --- | --- | --- |
| src/admin/guards/person-or-api-key.guard.ts | crea | Guard compuesto OR: delega en TenantApiKeyGuard (si X-Api-Key) o en PersonSessionGuard + TenantScopeGuard (si Bearer); 401 si ninguno. |
| src/admin/leads/admin-leads.controller.ts | modifica | Usa PersonOrApiKeyGuard en vez de TenantApiKeyGuard en el UseGuards. |
| src/admin/metrics/admin-metrics.controller.ts | modifica | Idem cambio de guard. |
| src/admin/properties/admin-properties.controller.ts | modifica | Idem cambio de guard. |
| src/admin/admin.module.ts | modifica | Registrar PersonOrApiKeyGuard como provider; importar AuthModule (que exporta PersonSessionGuard y TenantScopeGuard) para inyectarlos. |
| src/auth/auth.module.ts | modifica (posible) | Exportar PersonSessionGuard y TenantScopeGuard para consumirlos desde AdminModule. |
| src/auth/auth.controller.ts | modifica | Agrega GET /auth/me (PersonSessionGuard) -> { id, role, tenantId, email }. Resuelve el gap de identidad para nav por rol (AC-7/8) y URLs de tenant (AC-10/11/17), sin alterar POST /auth/login. |

### Frontend (todo NUEVO, en frontend/)

| Archivo / modulo | Que contiene |
| --- | --- |
| package.json, vite.config.ts, tsconfig.json, .env.example | Scaffolding Vite+React+TS; VITE_API_BASE_URL apunta al backend. |
| src/api/http-client.ts | fetch wrapper: base URL, Authorization, parseo uniforme, mapeo de errores a tipos (NetworkError, UnauthorizedError, ForbiddenError, NotFoundError, ValidationError). |
| src/api/endpoints.ts | Funciones tipadas: login, logout, listPeople, createPerson, deactivatePerson, resetPassword y firmas listas (sin pantalla) para leads/metrics/properties. |
| src/auth/session-store.ts | Lee/escribe/borra la sesion en sessionStorage; unica fuente de verdad del token. |
| src/auth/AuthContext.tsx | Estado de sesion en memoria + hidratacion desde sessionStorage al montar; expone login, logout, person (role/tenantId). |
| src/auth/ProtectedRoute.tsx | Redirige a /login si no hay sesion (AC-1). |
| src/routes/LoginPage.tsx | Formulario email+password, estados carga/error (AC-2/3/4). |
| src/routes/AppLayout.tsx | Layout autenticado: nav condicionada por rol (AC-7/8), boton logout (AC-5). |
| src/routes/PeoplePage.tsx | Consumo real de people (listar/crear/desactivar/reset). |
| src/components/Spinner.tsx, ErrorBanner.tsx | Estados de carga y error reutilizables en espanol (AC-13/14). |
| src/hooks/useApi.ts | Hook que envuelve una llamada y expone { loading, error, data, run } uniforme. |

## Decisiones tecnicas

- **Guard compuesto OR (PersonOrApiKeyGuard) en vez de reescribir la auth de los
  controllers.** Mantiene ambos mecanismos intactos y desacoplados: no duplica la
  logica de TenantApiKeyGuard ni de PersonSessionGuard, solo los orquesta. El ruteo
  por header (X-Api-Key -> API key; Bearer -> sesion) es determinista y evita
  ejecutar dos verificaciones costosas (argon2 / lookup DB) por request.
  Alternativas descartadas: (a) poner ambos guards en el UseGuards, que es AND y
  rompe ambos caminos; (b) marcar Public + logica en el handler, que mueve authZ al
  controller, contra el estilo de la casa (guards); (c) proxy backend-for-frontend,
  ya descartado por el usuario en la spec.

- **La rama de sesion del guard compuesto encadena TenantScopeGuard.** Sin el, una
  persona del tenant A con sesion valida podria leer los leads de /admin/tenants/B
  (el handler filtra por el tenantId=B de la ruta y devolveria datos de B).
  TenantScopeGuard ya resuelve esto (rechaza si person.tenantId no coincide con el
  tenantId de la ruta -> 403) y es la pieza reusada de A.1. Cubre AC-19; es la parte
  critica de aislamiento multi-tenant.

- **Frontend: Vite + React + TypeScript (SPA), no Next.js.** Es un panel interno
  detras de login: no hay SEO ni contenido publico, asi que SSR/RSC no aportan y si
  agregan superficie (server de Next, hidratacion, directivas use client, middleware
  de auth server-side que competiria con nuestra sesion opaca). Una SPA estatica se
  sirve como archivos, se despliega barato y consume la API por CORS como cualquier
  cliente. Vite da dev-server rapido y build simple. TypeScript por consistencia con
  el backend. Alternativas descartadas: Next.js App Router (peso/complejidad sin
  beneficio para panel logueado; su auth server-side friccionaria con el token
  opaco); CRA (deprecado).

- **Persistencia de sesion en sessionStorage (no localStorage, no cookie httpOnly,
  no solo memoria).** El token de PersonSessionGuard es un secreto portador (bearer):
  quien lo tenga actua como la persona. Analisis:
  - cookie httpOnly seria lo mas resistente a XSS, pero el backend hoy espera el
    token en Authorization: Bearer (contrato fijado por los e2e de A.1) y no setea
    cookies; adoptarla exige cambios de backend fuera del alcance de A.2. Descartada
    por ahora, anotada como mejora futura.
  - localStorage persiste indefinidamente y es legible por cualquier script: maxima
    exposicion a XSS y el token sobrevive al cierre del navegador.
  - solo memoria es lo mas seguro pero incumple AC-16 (recarga = re-login).
  - sessionStorage es el punto medio: sobrevive al reload de la pestana (cumple
    AC-16), se borra al cerrarla (reduce ventana de robo), no se comparte entre
    pestanas/origenes. El riesgo XSS se acota con las defensas estandar de la SPA
    (React escapa por defecto, sin innerHTML crudo, CSP en el hosting) y con el TTL
    corto de 12 h de la sesion de A.1. La cookie httpOnly queda documentada como
    evolucion recomendada.

- **Capa HTTP centralizada: un http-client.ts que normaliza toda respuesta a un
  resultado tipado o a un error tipado por status.** Un unico punto agrega
  Authorization, hace fetch, y mapea: fallo de red / backend caido -> NetworkError;
  401 -> UnauthorizedError (dispara limpieza de sesion + redirect, AC-6, via un
  callback registrado por AuthContext para no acoplar el cliente al router); 403 ->
  ForbiddenError (AC-9); 404 -> NotFoundError; 400 -> ValidationError (con el detalle
  del backend). Las pantallas nunca tocan fetch ni el token (AC-15): consumen
  endpoints.ts + useApi. Alternativa descartada: axios/react-query, dependencia extra
  no justificada para el tamano de A.2; fetch nativo + un hook alcanzan. Reevaluable
  cuando A.3/A.4 sumen cache/paginacion.

- **Frontend en frontend/ dentro del mismo repo, sin workspaces.** Cohesion de
  versionado y despliegue coordinado con el backend, sin la ceremonia de un monorepo
  con workspaces (que no aporta con dos paquetes y build separado). El backend ignora
  frontend/ (no esta bajo src/, no lo compila nest). Alternativa descartada: repo
  separado (friccion de sincronizar contratos y CI para un equipo chico).

- **useApi como hook uniforme de estados.** Centraliza { loading, error, data } para
  que carga (AC-13) y error (AC-14) se rendericen igual en toda pantalla con
  Spinner/ErrorBanner.

## Riesgos y edge cases

- **[BLOQUEANTE] El frontend no puede conocer role ni tenantId con el contrato
  actual.** POST /auth/login devuelve solo { token }. Sin role no se cumple AC-7/AC-8
  (nav por rol) y sin tenantId no se construyen las URLs /admin/tenants/:tenantId/*
  (AC-10/11/17). Se necesita /auth/me o enriquecer la respuesta de login. Excede el
  "solo guards" que la spec fija para el backend de A.2 -> ver Aprobaciones
  pendientes #1. A.2 no puede completarse sin resolver esto.
- **Regresion silenciosa del camino API key.** Al cambiar el guard hay que garantizar
  que las integraciones server-to-server siguen andando (AC-18). Mitigacion: los e2e
  existentes con X-Api-Key deben seguir en verde sin cambios, y se agregan e2e del
  camino sesion (AC-17) y del cross-tenant (AC-19).
- **Orden de verificacion ante ambos headers presentes.** Si llegan X-Api-Key y
  Bearer a la vez, definir precedencia determinista (propuesto: API key primero, por
  ser el camino legado) y no un OR que prueba ambos y filtra errores, para no
  enmascarar un 403 de scope como 401.
- **CORS.** El backend debe permitir el origen del frontend y el header
  Authorization. Es config de backend; si no esta habilitado, toda llamada falla como
  NetworkError. Dependencia de configuracion (posible micro-spec de backend).
- **XSS y el token en sessionStorage.** Mitigado con React (escape por defecto),
  prohibicion de innerHTML crudo con datos del backend, y CSP en hosting. Riesgo
  residual aceptado para A.2; cookie httpOnly documentada como evolucion.
- **401 durante una llamada en vuelo mientras el usuario navego.** El interceptor
  debe limpiar sesion y redirigir de forma idempotente (varias 401 concurrentes no
  deben disparar multiples redirects ni loops). Guardar un flag de "ya redirigiendo".
- **Contrasena temporal (AC-11) visible una sola vez.** No persistirla en estado
  global ni logs del cliente; mostrarla en un modal efimero con boton copiar.

## Trazabilidad

- **AC-1** -> ProtectedRoute redirige a /login sin renderizar la ruta si no hay sesion.
- **AC-2** -> LoginPage -> api.login -> guarda sesion en session-store + navega al area autenticada.
- **AC-3** -> error de login mapeado (401/429) -> ErrorBanner en la propia pagina, sin navegar ni persistir.
- **AC-4** -> useApi.loading deshabilita el submit mientras la llamada esta en curso.
- **AC-5** -> boton logout en AppLayout -> api.logout -> limpia sesion -> /login.
- **AC-6** -> http-client mapea 401 -> UnauthorizedError -> callback de AuthContext limpia sesion + redirect.
- **AC-7 / AC-8** -> AppLayout renderiza el item Personas solo si person.role es OWNER.
- **AC-9** -> 403 -> ForbiddenError -> mensaje de permisos en PeoplePage, sin datos de otras personas.
- **AC-10** -> PeoplePage invoca listPeople y renderiza tal cual la respuesta del backend.
- **AC-11** -> createPerson; si la respuesta trae temporaryPassword, modal copiable una sola vez.
- **AC-12** -> 409 -> error legible; no se agrega fila local.
- **AC-13** -> useApi.loading -> Spinner en la pantalla que origino la llamada.
- **AC-14** -> fallo de red -> NetworkError -> mensaje generico distinto de credenciales/permisos.
- **AC-15** -> http-client agrega Authorization: Bearer a toda request autenticada; las pantallas no tocan el token.
- **AC-16** -> sesion en sessionStorage; AuthContext hidrata al montar -> reload mantiene sesion.
- **AC-17** -> PersonOrApiKeyGuard autoriza por sesion sin API key; handler filtra por el tenantId de la persona.
- **AC-18** -> rama X-Api-Key del guard delega en TenantApiKeyGuard sin cambios; e2e legados en verde.
- **AC-19** -> rama sesion encadena TenantScopeGuard -> tenant B en la URL con sesion de A -> 403.

## Aprobaciones pendientes

> Pipeline critico (aislamiento multi-tenant): requieren visto bueno humano antes de task-splitter.

1. **RESUELTO (aprobado por el usuario, 2026-07-23): GET /auth/me.** Endpoint nuevo
   protegido por PersonSessionGuard que devuelve { id, role, tenantId, email }. No
   altera el contrato de POST /auth/login ni sus e2e existentes de A.1.
2. **RESUELTO (aprobado): Guard compuesto OR PersonOrApiKeyGuard** con precedencia
   API key -> sesion, y la rama sesion encadenando PersonSessionGuard + TenantScopeGuard.
3. **RESUELTO (aprobado): Stack frontend Vite+React SPA en frontend/ del mismo repo**
   (no Next.js, no repo aparte).
4. **RESUELTO (aprobado): Persistencia de sesion en sessionStorage** (no localStorage
   / no cookie httpOnly en A.2), con la cookie httpOnly documentada como evolucion.
5. **Dependencia de configuracion: CORS del backend** habilitando el origen del
   frontend y el header Authorization (posible micro-spec de backend). Sin objecion
   del usuario; se resuelve como parte de la implementacion.
