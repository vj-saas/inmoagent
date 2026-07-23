# Tasks A.2: Frontend base (login, sesión, layout, capa HTTP) + apertura aditiva de guards

> Producido por task-splitter a partir de spec.md y plan.md (ambos aprobados).
> Dificultad asignada según criterios de low/medium/high/crítico del CLAUDE.md
> del proyecto. Toda tarea marcada **crítico** requiere aprobación humana en
> cada fase (triage), no solo al final.

## Backend — guard compuesto y apertura aditiva

## T1 — Crear PersonOrApiKeyGuard (guard compuesto OR)
- **Dificultad:** high — **crítico** (aislamiento multi-tenant: decide qué
  mecanismo autoriza el acceso a datos de un tenant).
- **Descripción:** Crear `src/admin/guards/person-or-api-key.guard.ts`. Rama
  por header: `X-Api-Key` → delega en `TenantApiKeyGuard.canActivate` (camino
  legado intacto); `Authorization: Bearer` → delega en
  `PersonSessionGuard.canActivate` y luego en `TenantScopeGuard.canActivate`
  (person.tenantId === :tenantId de la ruta); ninguno de los dos → 401.
  Precedencia determinista: si llegan ambos headers, se evalúa primero
  `X-Api-Key`. No debe enmascarar un 403 de scope como 401. Solo el guard;
  no tocar los controllers todavía (eso es T3/T4/T5).
- **Valida:** AC-17, AC-18, AC-19 (vía unit tests del guard, no e2e — los e2e
  van en T6).
- **Dependencias:** ninguna.
- **Paralelizable:** sí (independiente del frontend; puede arrancar junto con
  T2 y con el bloque de frontend T7 en adelante).

## T2 — Agregar GET /auth/me
- **Dificultad:** high — no crítico (toca superficie de auth pero es
  read-only sobre la sesión propia, sin cruce de tenant ni escritura de
  secretos; aun así "auth admin y manejo de secretos" es high por regla del
  CLAUDE.md y ante la duda se elige el nivel más alto).
- **Descripción:** En `src/auth/auth.controller.ts`, agregar
  `GET /auth/me` protegido por `PersonSessionGuard`, que devuelve
  `{ id, role, tenantId, email }` de la persona autenticada. No debe alterar
  el contrato ni los tests e2e existentes de `POST /auth/login` (A.1).
- **Valida:** AC-20.
- **Dependencias:** ninguna.
- **Paralelizable:** sí.

## T3 — Aplicar PersonOrApiKeyGuard a admin-leads.controller.ts
- **Dificultad:** high — **crítico** (endpoint de datos de leads filtrado por
  tenant; el guard es la única barrera de aislamiento).
- **Descripción:** Reemplazar `TenantApiKeyGuard` por `PersonOrApiKeyGuard` en
  el `@UseGuards` del controller (queda `TenantThrottlerGuard` +
  `PersonOrApiKeyGuard`). Registrar el guard y sus dependencias
  (`PersonSessionGuard`, `TenantScopeGuard`) como providers/imports en
  `admin.module.ts` (import de `AuthModule` si hace falta exportarlos ahí,
  ver T3b). No tocar el handler ni los DTOs.
- **Valida:** AC-17, AC-18, AC-19 (para el recurso leads).
- **Dependencias:** T1 (el guard debe existir), y requiere que
  `auth.module.ts` exporte `PersonSessionGuard`/`TenantScopeGuard` si aún no
  lo hace (ajuste incluido en esta misma tarea si es trivial; si no, se separa
  como T3b explícito a criterio del implementer).
- **Paralelizable:** sí, en paralelo con T4 y T5 (mismo patrón, distinto
  controller — cuidado con conflictos si dos implementers tocan
  `admin.module.ts` a la vez; recomendado secuenciar T3→T4→T5 si el mismo
  implementer los hace, o coordinar el diff de `admin.module.ts` si son
  paralelos).

## T4 — Aplicar PersonOrApiKeyGuard a admin-metrics.controller.ts
- **Dificultad:** high — **crítico** (aislamiento multi-tenant sobre
  métricas).
- **Descripción:** Idéntico patrón que T3, aplicado a
  `src/admin/metrics/admin-metrics.controller.ts`.
- **Valida:** AC-17, AC-18, AC-19 (para el recurso metrics).
- **Dependencias:** T1.
- **Paralelizable:** sí (ver nota de coordinación en T3 sobre
  `admin.module.ts`).

## T5 — Aplicar PersonOrApiKeyGuard a admin-properties.controller.ts
- **Dificultad:** high — **crítico** (aislamiento multi-tenant sobre
  propiedades).
- **Descripción:** Idéntico patrón que T3, aplicado a
  `src/admin/properties/admin-properties.controller.ts`.
- **Valida:** AC-17, AC-18, AC-19 (para el recurso properties).
- **Dependencias:** T1.
- **Paralelizable:** sí (ver nota de coordinación en T3 sobre
  `admin.module.ts`).

## T6 — E2E: guard compuesto, camino API key intacto y cross-tenant rechazado
- **Dificultad:** high — **crítico** (es la prueba de que el aislamiento
  multi-tenant no se rompió; sin esto T3/T4/T5 no están terminadas de verdad).
- **Descripción:** Agregar/confirmar e2e que cubran, para los tres recursos
  (leads, metrics, properties): (a) sesión de persona sin API key autoriza y
  devuelve solo datos de su tenant (AC-17); (b) API key sin sesión sigue
  funcionando exactamente igual que antes — correr los e2e legados existentes
  y confirmarlos en verde, sin modificarlos (AC-18); (c) sesión de tenant A
  contra `:tenantId` de tenant B devuelve 403 sin datos de B (AC-19).
- **Valida:** AC-17, AC-18, AC-19 (cobertura e2e completa, los tres
  recursos).
- **Dependencias:** T3, T4, T5.
- **Paralelizable:** no (necesita los tres controllers ya modificados).

## Frontend — scaffolding y capa base

## T7 — Scaffold del proyecto Vite + React + TypeScript en frontend/
- **Dificultad:** low.
- **Descripción:** Crear `frontend/` con Vite+React+TS, `package.json`,
  `vite.config.ts`, `tsconfig.json`, `.env.example` con `VITE_API_BASE_URL`.
  Sin lógica de negocio ni de auth todavía. El backend no debe compilar ni
  depender de esta carpeta.
- **Valida:** ninguno directamente (prerequisito de infraestructura para
  todas las tareas de frontend; sin él no se puede validar ningún AC de
  frontend).
- **Dependencias:** ninguna.
- **Paralelizable:** sí, totalmente independiente del bloque backend.

## T8 — http-client.ts: capa HTTP centralizada con mapeo de errores
- **Dificultad:** medium (lógica estándar de cliente HTTP; no toca guards ni
  DB, pero maneja el token de sesión — no clasifica como high según los
  criterios del CLAUDE.md, que reservan high/crítico para el lado backend de
  auth y aislamiento).
- **Descripción:** Crear `frontend/src/api/http-client.ts`: wrapper de fetch
  con base URL desde `VITE_API_BASE_URL`, agrega `Authorization: Bearer` a
  requests autenticados, y mapea respuestas a tipos:
  `NetworkError` (falla de red/backend caído), `UnauthorizedError` (401),
  `ForbiddenError` (403), `NotFoundError` (404), `ValidationError` (400, con
  detalle del backend). Expone un callback registrable para el caso 401 (para
  que `AuthContext`, no este módulo, decida limpiar sesión y redirigir).
- **Valida:** AC-14, AC-15 (parcial: AC-6 se completa en T10 cuando se
  conecta el callback de 401 a la limpieza de sesión real).
- **Dependencias:** T7.
- **Paralelizable:** sí, en paralelo con T9.

## T9 — session-store.ts: persistencia de sesión en sessionStorage
- **Dificultad:** medium.
- **Descripción:** Crear `frontend/src/auth/session-store.ts`: única fuente
  de verdad para leer/escribir/borrar `{ token, role, tenantId, email }` en
  `sessionStorage`. No debe haber otro lugar del código que lea/escriba
  sessionStorage directamente.
- **Valida:** AC-16 (persistencia ante reload — se completa junto con T10 que
  hidrata desde acá al montar).
- **Dependencias:** T7.
- **Paralelizable:** sí, en paralelo con T8.

## T10 — AuthContext: estado de sesión, hidratación y conexión del 401
- **Dificultad:** medium.
- **Descripción:** Crear `frontend/src/auth/AuthContext.tsx`: hidrata el
  estado de sesión desde `session-store` al montar, expone `login`, `logout`,
  `person` (role/tenantId/email) al resto de la app. Registra el callback de
  401 de `http-client` para que, ante un 401 en cualquier llamada, limpie la
  sesión de `session-store` y dispare la redirección a `/login` de forma
  idempotente (un flag de "ya redirigiendo" para no disparar múltiples
  redirects ante 401 concurrentes).
- **Valida:** AC-6, AC-16.
- **Dependencias:** T8, T9.
- **Paralelizable:** no (necesita ambos).

## T11 — ProtectedRoute
- **Dificultad:** medium.
- **Descripción:** Crear `frontend/src/auth/ProtectedRoute.tsx`: si no hay
  sesión válida en `AuthContext`, redirige a `/login` sin renderizar el
  contenido de la ruta protegida.
- **Valida:** AC-1.
- **Dependencias:** T10.
- **Paralelizable:** sí, en paralelo con T12/T13 una vez lista T10.

## T12 — LoginPage
- **Dificultad:** medium.
- **Descripción:** Crear `frontend/src/routes/LoginPage.tsx`: formulario
  email + contraseña. Invoca `api.login` (necesita T14 para la función
  tipada); si éxito, guarda sesión vía `AuthContext.login` y navega al área
  autenticada. Mientras la llamada está en curso, muestra estado de carga y
  deshabilita el reenvío del formulario. Si falla, muestra mensaje de error
  legible en español sin navegar ni persistir sesión.
- **Valida:** AC-2, AC-3, AC-4.
- **Dependencias:** T10, T14 (necesita `api.login` tipado), T16 (Spinner/
  ErrorBanner reutilizables).
- **Paralelizable:** sí, en paralelo con T11 y T13.

## T13 — AppLayout: navegación por rol y logout
- **Dificultad:** medium.
- **Descripción:** Crear `frontend/src/routes/AppLayout.tsx`: layout del área
  autenticada; muestra la opción de gestión de personas solo si
  `person.role === 'OWNER'`; incluye botón de logout que invoca
  `api.logout`, limpia sesión vía `AuthContext.logout` y redirige a
  `/login`.
- **Valida:** AC-5, AC-7, AC-8.
- **Dependencias:** T10, T14 (necesita `api.logout` tipado).
- **Paralelizable:** sí, en paralelo con T11 y T12.

## T14 — endpoints.ts: funciones tipadas de la API
- **Dificultad:** medium.
- **Descripción:** Crear `frontend/src/api/endpoints.ts` sobre `http-client`:
  `login`, `logout`, `getMe` (consume `GET /auth/me` de T2), `listPeople`,
  `createPerson`, `deactivatePerson`, `resetPassword`. Dejar las firmas
  tipadas y listas (sin pantalla) para leads/metrics/properties, que
  consumirán A.3/A.4/A.5.
- **Valida:** ninguno directamente por sí sola (es la capa que otras tareas
  usan para validar AC-2, AC-5, AC-10, AC-11, AC-12, AC-20); si se entrega
  sin consumidores no hay test de aceptación que la ejercite en aislamiento —
  se valida indirectamente vía T12/T13/T17.
- **Dependencias:** T8 (necesita `http-client`), T2 (contrato de `GET
  /auth/me` debe existir para tipar `getMe` correctamente, aunque puede
  mockearse mientras tanto).
- **Paralelizable:** sí, en paralelo con T9/T10/T11 una vez lista T8.

## T15 — useApi: hook uniforme de loading/error/data
- **Dificultad:** low.
- **Descripción:** Crear `frontend/src/hooks/useApi.ts`: envuelve una llamada
  a la API y expone `{ loading, error, data, run }` de forma uniforme para
  cualquier pantalla.
- **Valida:** AC-13 (soporte genérico; se ejercita en las pantallas concretas
  T12/T13/T17).
- **Dependencias:** T8.
- **Paralelizable:** sí.

## T16 — Spinner y ErrorBanner
- **Dificultad:** low.
- **Descripción:** Crear `frontend/src/components/Spinner.tsx` y
  `ErrorBanner.tsx`: estados de carga y de error genéricos, reutilizables,
  en español.
- **Valida:** AC-13, AC-14 (soporte visual; se ejercita en las pantallas
  concretas).
- **Dependencias:** T7.
- **Paralelizable:** sí, totalmente independiente.

## T17 — PeoplePage: consumo real de gestión de personas
- **Dificultad:** medium.
- **Descripción:** Crear `frontend/src/routes/PeoplePage.tsx`: lista personas
  del tenant (vía `listPeople`), permite crear (`createPerson` — si la
  respuesta trae `temporaryPassword`, mostrarla una única vez en un modal
  efímero con botón copiar, sin persistirla en estado global ni logs),
  desactivar y resetear contraseña. Si el backend rechaza la creación (409 u
  otro), mostrar el motivo sin crear fila local. Si el backend responde 403
  (rol AGENT accediendo por URL), mostrar mensaje de permisos sin exponer
  datos de otras personas.
- **Valida:** AC-9, AC-10, AC-11, AC-12.
- **Dependencias:** T10, T14, T15, T16.
- **Paralelizable:** no respecto de sus dependencias, pero sí en paralelo con
  T11/T12/T13 una vez éstas estén disponibles (implementers distintos).

## T18 — Configurar CORS en el backend para el origen del frontend
- **Dificultad:** low.
- **Descripción:** Habilitar CORS en el backend NestJS para el origen de
  `frontend/` (dev y el que corresponda en deploy), permitiendo el header
  `Authorization`. Sin esto, toda llamada del frontend falla como
  `NetworkError` aunque el resto esté bien implementado.
- **Valida:** ninguno de forma aislada — es dependencia de configuración para
  que AC-2, AC-5, AC-6, AC-10, AC-11, AC-17 sean observables end-to-end desde
  el navegador real (no bloquea los tests unitarios/e2e de backend ni los
  tests de frontend con mocks).
- **Dependencias:** ninguna (puede hacerse en cualquier momento antes de
  pruebas manuales/e2e de integración real navegador↔backend).
- **Paralelizable:** sí.

---

## Huecos de cobertura detectados

- **T14 y T18** no tienen un AC propio e independiente que las dé por
  terminadas; se validan indirectamente a través de las tareas que las
  consumen. Se dejan explícitas para que el implementer sepa que su "listo"
  depende de que T12/T13/T17 (para T14) o de pruebas de integración real
  (para T18) las ejerciten.
- No hay tarea explícita de tests e2e de frontend que verifiquen AC-1 a AC-16
  de punta a punta (solo unit/component tests implícitos en cada tarea de
  UI). Si el proyecto quiere e2e de frontend (p. ej. Playwright), falta una
  tarea explícita — no incluida aquí porque la spec/plan no la piden, pero
  se señala como hueco a resolver si se decide sumarla.

## Orden de ejecución sugerido

**Grupo 1 (paralelo, sin dependencias):**
T1, T2, T7, T16, T18.

**Grupo 2 (paralelo, depende solo de Grupo 1):**
- T3, T4, T5 dependen de T1 (coordinar si el mismo archivo
  `admin.module.ts` se toca desde varios implementers a la vez; si se
  paraleliza, un implementer debe resolver el merge de ese archivo).
- T8, T9 dependen de T7.
- T15 depende de T8 (puede arrancar apenas T8 esté, en paralelo con T9).

**Grupo 3 (secuencial sobre Grupo 2):**
- T6 depende de T3+T4+T5 (secuencial, no paralelizable).
- T10 depende de T8+T9.
- T14 depende de T8+T2.

**Grupo 4 (paralelo, depende de Grupo 3):**
T11, T12, T13 dependen de T10 (y T12/T13 también de T14, T15/T16).

**Grupo 5:**
T17 depende de T10, T14, T15, T16 (puede correr en paralelo con T11/T12/T13
si hay implementers distintos disponibles).

**Camino crítico (secuencia obligatoria, todo etiquetado crítico):**
T1 → (T3, T4, T5 en paralelo) → T6.
Este camino requiere aprobación humana explícita en cada fase antes de
avanzar a la siguiente, según la clasificación de aislamiento multi-tenant
del CLAUDE.md.
