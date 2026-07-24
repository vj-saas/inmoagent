# Plan A.5: Dashboard

> Producido por planner. Define COMO se construye lo que la spec (A.5) pide.
> Fase **exclusivamente frontend**, de **solo lectura**. No hay migracion, no hay
> endpoint nuevo, no hay guardrails de escritura. Clasificacion esperada:
> **medium** (consumo de un endpoint de metricas ya existente + UI). El
> aislamiento multi-tenant es critico pero **ya esta garantizado por el backend**
> vigente (PersonOrApiKeyGuard -> TenantScopeGuard): esta fase no introduce
> ninguna query ni ruta que lo pueda romper.

## Arquitectura

Un solo frente: el frontend (frontend/src/). Se consume el endpoint
GET /admin/tenants/:tenantId/metrics que ya existe y ya soporta rango de fechas
— confirmado leyendo el backend real:

- src/admin/metrics/metrics-query.dto.ts: MetricsQueryDto exige from y to como
  @IsDateString() (ambos requeridos).
- src/admin/metrics/metrics.service.ts: getMetrics(tenantId, from, to) devuelve
  la interfaz MetricsResult (shape exacto abajo).
- src/admin/metrics/admin-metrics.controller.ts: @Get() bajo
  admin/tenants/:tenantId/metrics, protegido por
  TenantThrottlerGuard + PersonOrApiKeyGuard, convierte query.from/to a
  new Date(...) y delega. No requiere ningun cambio.

Se replica el patron ya establecido en A.2/A.3/A.4:

- DashboardPage (routes/DashboardPage.tsx) = orquestador.
  - useAuth() -> { person.tenantId, token }
  - estado local { from, to } (default: ultimos 30 dias)
  - validacion from<=to ANTES de invocar
  - useApi(getMetrics) -> { loading, error, data }
  - DateRangePicker (components/dashboard/DateRangePicker.tsx) = entrada de rango
  - render mutuamente excluyente: Spinner (loading) | ErrorBanner (error) |
    validacion local (from>to) | grilla de MetricCard[], igual que LeadsPage.

Flujo: DashboardPage monta -> calcula rango por defecto (hoy y hoy-30d) ->
dispara getMetrics(tenantId, { from, to }, token) via useApi. Cada vez que
DateRangePicker emite un rango nuevo valido, se re-dispara. Si from > to, no se
invoca el endpoint y se muestra un mensaje de validacion en espanol.

## Entidades / modulos afectados

**Backend: ninguno.** Verificado contra el codigo real: el endpoint ya calcula
las cinco metricas pedidas y ya acepta from/to. Fuera de alcance por spec y
confirmado por el planner.

**Frontend (frontend/src/):**

- api/endpoints.ts (**modifica**): reemplaza getMetrics(): Promise<unknown> por
  Promise<MetricsResult>; agrega la interfaz MetricsResult calcada del service;
  elimina los dos comentarios TODO(A.4) del bloque de metricas. Se conserva
  MetricsQuery { from; to } (ya existe y sirve).
- routes/DashboardPage.tsx (**nuevo**): orquestador de la pantalla.
- components/dashboard/DateRangePicker.tsx (**nuevo**): dos input type=date +
  validacion de rango; emite el rango elegido al padre.
- components/dashboard/MetricCard.tsx (**nuevo**): tarjeta presentacional
  (label en espanol + valor numerico). Sin logica.
- App.tsx (**modifica**): agrega la ruta hija dashboard bajo el layout
  autenticado. No cambia el index Navigate to=/leads (ver decision de ruta).
- routes/AppLayout.tsx (**modifica**): agrega Link to=/dashboard visible para
  ambos roles (junto a Leads).
- Tests (**nuevos**): DashboardPage.test.tsx, DateRangePicker.test.tsx,
  MetricCard.test.tsx; se extiende AppLayout.test.tsx, App.test.tsx y
  endpoints.test.ts (tipo de getMetrics).

## Decisiones tecnicas

### Tipo MetricsResult — calcado exacto del service

Se copia campo por campo desde src/admin/metrics/metrics.service.ts (la interfaz
MetricsResult ya esta definida ahi; el frontend la replica sin inventar campos,
misma disciplina que Lead/Message en endpoints.ts):

```ts
export interface MetricsResult {
  range: { from: string; to: string };   // ISO string (service usa .toISOString())
  newLeads: number;
  activeConversations: number;
  handoffs: number;
  appointments: { proposed: number; confirmed: number };
}
```

**Por que string en range**: el service serializa con from.toISOString() /
to.toISOString(); en JSON llegan como string, nunca como Date (mismo criterio de
fechas que A.3/A.4). El frontend no asume Date.

getMetrics pasa a Promise<MetricsResult> y se elimina el TODO(A.4). Alternativa
descartada: dejar unknown y castear en la pagina — rompe la convencion de tipado
real de endpoints.ts y pierde el chequeo del compilador sobre los nombres de
campo anidados (appointments.proposed).

### Selector de rango de fechas — componente nuevo, input type=date

**Decision: componente nuevo DateRangePicker con dos input type=date nativos.**
No existe nada reutilizable (A.4 usa un datetime-local suelto dentro de
AssignmentControl, no un componente de rango). Se evita agregar una dependencia
de date-picker (CLAUDE.md: no sumar dependencias sin justificacion fuerte); el
input nativo cubre el caso.

**Formato de fecha: el input HTML vs. el backend.**
- input type=date produce y consume YYYY-MM-DD (fecha local, sin hora).
- El backend valida con @IsDateString() y hace new Date(from). IsDateString de
  class-validator acepta tanto YYYY-MM-DD como ISO completo, asi que mandar el
  valor crudo del input funcionaria; pero para que el rango sea inclusivo y sin
  ambiguedad de zona horaria, DateRangePicker convierte antes de emitir:
  - from -> inicio del dia elegido (00:00:00.000 local), luego toISOString().
  - to   -> fin del dia elegido (23:59:59.999 local), luego toISOString().
  Asi to incluye todo el dia elegido (el service filtra lte: to; sin el fin de
  dia, un lead creado a las 15:00 del dia to quedaria fuera). Se emiten ISO
  strings, que es lo que el endpoint espera y lo que MetricsQuery ya declara.

  Nota (contrato, no codigo): el picker mantiene su estado interno en YYYY-MM-DD
  (lo que el input entiende) y expone hacia DashboardPage los dos ISO strings ya
  normalizados. La pagina nunca ve el formato del input.

**Calculo del default (ultimos 30 dias), AC-1.** Al montar, DashboardPage calcula
to = hoy y from = hoy - 30 dias (en YYYY-MM-DD local). Es el estado inicial del
picker y dispara la primera llamada sin intervencion de la persona. Se computa
una sola vez (init de useState, no en cada render) para no recalcular ni
re-disparar en loop.

**Validacion from <= to (AC-4).** Vive en el borde entre picker y pagina: el
picker no emite un rango invalido cuando fromDay > toDay, y DashboardPage no
llama a getMetrics en ese caso, mostrando un mensaje de validacion en espanol (la
fecha desde no puede ser posterior a hasta). Se compara a nivel de dia
(YYYY-MM-DD, cuyo orden lexicografico == cronologico), no sobre los ISO ya con
hora, para que elegir el mismo dia en ambos sea valido. Alternativa descartada:
dejar que el backend devuelva 400 — la spec (AC-4) pide explicitamente NO invocar
el endpoint con rango invalido.

### Estructura de componentes

- **DashboardPage** (orquestador): igual rol que LeadsPage. Tiene el estado del
  rango, el useApi(getMetrics), la validacion, y elige que render mostrar
  (Spinner | ErrorBanner | mensaje de validacion | grilla). tenantId y token
  desde useAuth(), nunca hardcodeado.
- **DateRangePicker** (presentacional + validacion local): recibe el rango actual
  y un onChange; no conoce la API ni useApi. Reutilizable a futuro.
- **MetricCard** (presentacional puro): { label: string; value: number }.
  DashboardPage renderiza cinco: Leads nuevos, Conversaciones activas, Handoffs,
  Citas propuestas, Citas confirmadas. Separar la tarjeta del orquestador
  mantiene el patron de componentes chicos de A.3/A.4 y hace trivial el test de
  cada pieza.

**Anti cero==error (AC-6).** Las tarjetas solo se renderizan cuando
!loading && !error && data. Con error presente se muestra unicamente el
ErrorBanner (nunca tarjetas en cero), igual que hace LeadsPage. Un cero real del
backend se muestra como tarjeta 0; un error nunca llega a pintar tarjetas.

### Decision de ruta: /dashboard nueva, sin tocar el default / -> /leads

**Decision: agregar /dashboard como ruta hija nueva y dejar el index
(Navigate to=/leads) intacto.**

Justificacion:
- Cambiar el default romperia el AC-13 de A.2 (documentado en el header de
  App.tsx: / redirige a /leads) y su test asociado (App.test.tsx). No hay pedido
  de negocio en la spec que exija que el dashboard sea la home; la spec deja la
  ruta a criterio del planner y solo exige que sea accesible por link para ambos
  roles.
- Menor superficie de cambio y de regresion: A.5 es aditiva. Agregar una ruta y
  un link no toca el contrato de arranque ya testeado.
- El dia que producto quiera el dashboard como landing, es un cambio de una linea
  (Navigate to=/dashboard) aislado y con su propia decision — no lo mezclamos aca
  sin pedido explicito.

Alternativa descartada: cambiar index a /dashboard. Romperia tests vigentes y
tomaria una decision de producto (cual es la home del panel) que la spec no pide.

### Nav en AppLayout (AC-8)

Se agrega Link to=/dashboard sin guardia de rol (igual que Leads), visible para
OWNER y AGENT. Se usa la etiqueta **Panel** (mas natural en espanol que
Dashboard; todo el UI del panel esta en espanol). El link OWNER-only de Gestion
de personas queda como esta.

## Riesgos y edge cases

- **Zona horaria del rango.** El input da fecha local; normalizar from->00:00 y
  to->23:59:59.999 en hora local evita que hoy pierda las ultimas horas al
  serializar a ISO/UTC. Riesgo residual: cerca de medianoche UTC el conteo de hoy
  puede correrse un dia para tenants en AR (UTC-3); aceptable para metricas
  agregadas y consistente con como el backend ya interpreta el rango. Se deja
  documentado, sin sobre-ingenieria de tz explicita (fuera de alcance).
- **Re-disparo en loop.** El default se calcula en el init de useState (no en
  cada render) y el useEffect depende de from/to normalizados; cambiar el rango
  dispara una sola llamada. Mismo patron .catch de LeadsPage para no dejar
  rechazos sin manejar.
- **tenantId vacio.** Si person aun no cargo, no se dispara (guard if tenantId),
  igual que LeadsPage.
- **Aislamiento multi-tenant (AC-7, critico pero ya cubierto).** El frontend solo
  puede mandar el tenantId de la sesion (viene de AuthContext, no editable por la
  persona). Si por manipulacion se pidiera otro tenant, el backend responde 403
  via PersonOrApiKeyGuard/TenantScopeGuard y el ErrorBanner muestra el error sin
  pintar metricas ajenas. Esta fase no agrega ninguna query ni relaja ningun
  guard.
- **Sin acciones de escritura (AC-9).** La pantalla no importa ni renderiza
  ningun control mutador; solo getMetrics (GET). Verificable por inspeccion: no
  se importa ninguna funcion de escritura de endpoints.ts.
- **Rango muy amplio / performance.** El endpoint hace cinco count con
  Promise.all sobre columnas ya indexadas por tenant; rangos grandes son baratos.
  Sin paginacion (son agregados). Throttle del controller (120/min) cubre abuso.

## Trazabilidad

- **AC-1** -> DashboardPage calcula default (hoy-30d..hoy) en el init del estado y
  dispara getMetrics al montar con tenantId de useAuth, sin intervencion.
- **AC-2** -> cinco MetricCard mapeadas a newLeads, activeConversations, handoffs,
  appointments.proposed, appointments.confirmed, con labels en espanol.
- **AC-3** -> onChange de DateRangePicker actualiza {from,to} -> useEffect
  re-dispara getMetrics y re-renderiza las tarjetas con la respuesta.
- **AC-4** -> validacion fromDay <= toDay en el borde picker/pagina; si falla, NO
  se llama al endpoint y se muestra mensaje de validacion en espanol.
- **AC-5** -> useApi.loading -> Spinner visible durante la llamada.
- **AC-6** -> tarjetas solo con !loading && !error && data; con error solo
  ErrorBanner, nunca ceros indistinguibles.
- **AC-7** -> tenantId siempre de AuthContext; backend ya responde 403 a
  cross-tenant (guard vigente). El frontend no lo puede violar.
- **AC-8** -> Link to=/dashboard en AppLayout sin guardia de rol.
- **AC-9** -> la pantalla no importa ninguna funcion de escritura; solo GET.
- **AC-10** -> labels, picker, mensajes de error y validacion en espanol.

## Aprobaciones pendientes

> Todas aprobadas por el usuario (2026-07-24), tal como las proponía el plan.

1. **APROBADO:** Ruta `/dashboard` nueva sin cambiar el default `/ -> /leads`.
2. **APROBADO:** Etiqueta del nav: **Panel**.
3. **APROBADO:** Normalización de rango en el picker (from->00:00,
   to->23:59:59.999 local, emitidos como ISO) para un rango inclusivo.
