# Spec A.5: Dashboard

## Contexto

A.4 cerró la ficha del lead (lectura + acciones de escritura sobre un lead
individual). El backend ya expone desde antes `GET
/admin/tenants/:tenantId/metrics` (`MetricsService`, ver
`docs/04-PLAN-FASES.md` Fase 6), que ya acepta un rango de fechas (`from`/`to`,
ambos requeridos, `IsDateString`) y ya está protegido por los mismos guards que
el resto del módulo admin (`TenantThrottlerGuard`, `PersonOrApiKeyGuard`). El
frontend, en cambio, solo tiene una función `getMetrics` declarada en
`endpoints.ts` con un `TODO(A.4)` explícito de "tipar `MetricsResult` real
cuando se consuma desde pantallas": hoy nadie la invoca desde ninguna
pantalla, y no existe ruta ni link de navegación al dashboard.

Según `docs/08-PROXIMOS-PASOS.md` (A.5), lo que falta es exclusivamente
frontend: "Tarjetas con las métricas que ya calcula `MetricsService` (leads
nuevos, conversaciones activas, handoffs, citas). Selector de rango de
fechas." Se confirmó leyendo el código que el endpoint **ya soporta** el
selector de rango (no requiere extender el backend): `MetricsQueryDto` exige
`from` y `to` como fechas ISO, y `MetricsService.getMetrics(tenantId, from,
to)` ya calcula, para ese rango:

- `newLeads`: leads creados (`createdAt`) dentro del rango.
- `activeConversations`: leads que no están en `OPTED_OUT` con
  `lastMessageAt` dentro del rango.
- `handoffs`: leads con `handoffAt` dentro del rango.
- `appointments.proposed`: citas con `status = PROPOSED` creadas
  (`createdAt`) dentro del rango.
- `appointments.confirmed`: citas con `status = CONFIRMED` actualizadas
  (`updatedAt`) dentro del rango.

Por tratarse de una pantalla exclusivamente de lectura (sin ninguna acción de
escritura, a diferencia de A.3/A.4), esta spec es deliberadamente más simple:
no hay migraciones, no hay nuevos endpoints, no hay guardrails de escritura
que verificar.

## Alcance

- **Frontend — tipado real de `MetricsResult`** en `endpoints.ts`,
  reemplazando el `Promise<unknown>` actual por una interfaz que refleje
  exactamente la forma que ya devuelve el backend: `range: { from: string; to:
  string }`, `newLeads: number`, `activeConversations: number`, `handoffs:
  number`, `appointments: { proposed: number; confirmed: number }`. Se
  elimina el comentario `TODO(A.4)` (ya no aplica).
- **Frontend — nueva pantalla de dashboard** (ruta nueva, p. ej. `/dashboard`
  o como página de inicio del área autenticada — a criterio del `planner`),
  accesible para ambos roles (`OWNER` y `AGENT`), que:
  - Ofrece un selector de rango de fechas (`from`, `to`) con un rango por
    defecto razonable al entrar (p. ej. últimos 30 días) sin requerir que la
    persona elija fechas manualmente para ver algo.
  - Al cargar (y cada vez que cambia el rango elegido) invoca `GET
    /admin/tenants/:tenantId/metrics` con el `tenantId` de la persona logueada
    y el `from`/`to` seleccionados.
  - Muestra una tarjeta por cada métrica devuelta: leads nuevos
    (`newLeads`), conversaciones activas (`activeConversations`), handoffs
    (`handoffs`), citas propuestas (`appointments.proposed`) y citas
    confirmadas (`appointments.confirmed`), con etiquetas en español.
  - Muestra estado de carga y de error reutilizando el patrón ya establecido
    en A.2/A.3/A.4 (spinner, mensaje de error legible), sin mostrar tarjetas
    con valores en cero indistinguibles de un error real.
  - Valida en el propio selector que `from` no sea posterior a `to` antes de
    invocar el endpoint (evita un 400 evitable del backend por rango
    inválido).
  - Es de solo lectura: ningún control de la pantalla dispara una mutación.
- **Frontend — nav**: agregar un link "Dashboard" (o el nombre que el
  `planner` prefiera, en español) en `AppLayout` visible para ambos roles,
  igual que "Leads" hoy.

## Fuera de alcance

- Cualquier cambio al backend (`MetricsQueryDto`, `MetricsService`,
  `AdminMetricsController`): el endpoint ya soporta rango de fechas y ya
  calcula todas las métricas pedidas; no se agregan métricas nuevas ni se
  cambia su cálculo en esta spec.
- Gráficos, series temporales o comparación entre rangos (p. ej. "vs. período
  anterior"): la spec pide tarjetas con el total del rango elegido, no
  visualizaciones más ricas.
- Exportar el dashboard (CSV, PDF, etc.).
- Cualquier acción de escritura desde el dashboard (marcar contactado, liberar
  handoff, etc. — eso ya vive en A.4 sobre la ficha del lead individual).
- Filtrado del dashboard por asesor (`assignedUserId`) o por estado de lead:
  las métricas son agregadas del tenant completo en el rango, tal como ya las
  calcula `MetricsService` hoy.
- Cola de "llamar hoy" y vista de agenda (Fase B).

## Criterios de aceptación (EARS)

**AC-1.** WHEN una persona con sesión válida abre el dashboard THE SYSTEM
SHALL invocar `GET /admin/tenants/:tenantId/metrics` con el `tenantId` de esa
persona y un rango de fechas por defecto, sin requerir que la persona elija
fechas manualmente para ver datos.

**AC-2.** WHEN el backend devuelve las métricas del rango THE SYSTEM SHALL
mostrar una tarjeta con cada uno de los siguientes valores, con su etiqueta
en español: leads nuevos (`newLeads`), conversaciones activas
(`activeConversations`), handoffs (`handoffs`), citas propuestas
(`appointments.proposed`) y citas confirmadas (`appointments.confirmed`).

**AC-3.** WHEN una persona selecciona un nuevo rango de fechas (`from`/`to`)
en el selector del dashboard THE SYSTEM SHALL reinvocar `GET
/admin/tenants/:tenantId/metrics` con los nuevos valores de `from` y `to`, y
actualizar las tarjetas con la respuesta recibida.

**AC-4.** IF una persona selecciona un rango donde `from` es posterior a
`to` THEN THE SYSTEM SHALL NOT invocar el endpoint de métricas con ese rango,
mostrando en cambio un mensaje de validación legible en español.

**AC-5.** WHILE la llamada a `GET .../metrics` está en curso THE SYSTEM
SHALL mostrar un estado de carga distinguible en el dashboard.

**AC-6.** IF la llamada a `GET .../metrics` falla (red o error del backend)
THEN THE SYSTEM SHALL mostrar un mensaje de error legible en español, sin
mostrar tarjetas con valores en cero indistinguibles de un error real.

**AC-7.** WHEN una persona con sesión válida de un tenant A hace que el
dashboard invoque el endpoint con el `:tenantId` de un tenant B THE SYSTEM
SHALL rechazar la petición (403) sin mostrar métricas del tenant B,
preservando el aislamiento multi-tenant ya vigente.

**AC-8.** THE SYSTEM SHALL permitir el acceso al dashboard a personas con
rol `OWNER` y con rol `AGENT` por igual (sin restricción de rol adicional a
la ya vigente de sesión válida).

**AC-9.** THE SYSTEM SHALL NOT exponer en el dashboard ningún control que
dispare una mutación (crear, editar o borrar datos): la pantalla es de solo
lectura.

**AC-10.** THE SYSTEM SHALL renderizar todo el dashboard (etiquetas de las
tarjetas, selector de rango, mensajes de error y de validación) en español.
