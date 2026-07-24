# Tasks A.5: Dashboard

> Producido por task-splitter a partir de spec.md y plan.md (ambos aprobados).
> Fase exclusivamente frontend, de solo lectura. Sin backend nuevo, sin
> migraciones. Clasificación de dificultad según CLAUDE.md del proyecto
> (sección "Qué es low / medium / high en este proyecto"). Ninguna tarea de
> esta fase cae en la sección "crítico" (no hay resolución de tenant nueva ni
> tocan guardrails de FSM/webhook/LLM): el aislamiento multi-tenant ya está
> garantizado por el backend vigente y esta fase no introduce ninguna query
> nueva.

## T1 — Tipar `MetricsResult` en `endpoints.ts`

- **Dificultad:** low
- **Descripción:** En `frontend/src/api/endpoints.ts`, reemplazar el
  `Promise<unknown>` actual de `getMetrics` por `Promise<MetricsResult>`.
  Agregar la interfaz `MetricsResult` calcada campo por campo de
  `src/admin/metrics/metrics.service.ts` (backend): `range: { from: string; to:
  string }`, `newLeads: number`, `activeConversations: number`, `handoffs:
  number`, `appointments: { proposed: number; confirmed: number }`. Eliminar
  los comentarios `TODO(A.4)` del bloque de métricas. No tocar `MetricsQuery`
  (`{ from; to }`), que ya existe y sirve. Es un cambio puramente de tipado,
  sin lógica nueva ni cambio de comportamiento en runtime.
- **Valida:** AC-2 (los nombres de campo tipados son los que luego consumen
  las tarjetas) vía `frontend/src/api/endpoints.test.ts` (tipo de retorno de
  `getMetrics`).
- **Dependencias:** ninguna
- **Paralelizable:** sí

## T2 — Componente `MetricCard`

- **Dificultad:** low
- **Descripción:** Crear `frontend/src/components/dashboard/MetricCard.tsx`:
  componente presentacional puro, sin lógica ni llamadas a API, que recibe
  `{ label: string; value: number }` y renderiza la etiqueta y el valor. Sin
  estado, sin efectos. Etiqueta siempre en español (la decide quien lo
  instancia, no el componente).
- **Valida:** AC-2 (una tarjeta por métrica, con etiqueta en español), AC-10
  (render en español) vía `frontend/src/components/dashboard/MetricCard.test.tsx`.
- **Dependencias:** ninguna
- **Paralelizable:** sí

## T3 — Componente `DateRangePicker` con normalización y validación de rango

- **Dificultad:** medium
- **Descripción:** Crear `frontend/src/components/dashboard/DateRangePicker.tsx`:
  dos `input type="date"` (estado interno en `YYYY-MM-DD`) más validación
  `fromDay <= toDay` a nivel de día (orden lexicográfico). Al emitir un rango
  válido hacia el padre (`onChange`), normaliza: `from` → inicio del día
  elegido (00:00:00.000 local) y `to` → fin del día elegido (23:59:59.999
  local), ambos convertidos con `toISOString()` antes de emitir (rango
  inclusivo, aprobado por el usuario). Si `fromDay > toDay`, el componente NO
  emite un rango nuevo y expone el estado de validación inválida para que el
  padre muestre el mensaje en español (el picker no es quien pinta el
  mensaje de error, solo no emite y señaliza inválido — el mensaje vive en
  `DashboardPage`, ver T4). Sin llamadas a API, sin conocimiento de
  `useApi` ni del endpoint.
- **Valida:** AC-3 (emite `from`/`to` nuevos al padre en cada cambio válido),
  AC-4 (no emite rango cuando `from > to`), AC-10 (labels del picker en
  español) vía `frontend/src/components/dashboard/DateRangePicker.test.tsx`.
- **Dependencias:** ninguna
- **Paralelizable:** sí

## T4 — `DashboardPage` orquestador

- **Dificultad:** medium
- **Descripción:** Crear `frontend/src/routes/DashboardPage.tsx` siguiendo el
  patrón de `LeadsPage`: obtiene `{ person.tenantId, token }` de `useAuth()`;
  calcula el rango por defecto (hoy y hoy-30 días, en `YYYY-MM-DD` local) una
  sola vez en el init de `useState` (no en cada render); invoca
  `getMetrics(tenantId, { from, to }, token)` vía `useApi` al montar y cada
  vez que `DateRangePicker` (T3) emite un rango válido nuevo; si el rango
  actual es inválido (`from > to`), NO invoca el endpoint y muestra el
  mensaje de validación en español ("la fecha desde no puede ser posterior a
  hasta") en vez de la grilla. Render mutuamente excluyente: Spinner
  (loading) | ErrorBanner (error) | mensaje de validación | grilla de cinco
  `MetricCard` (T2) mapeadas a `newLeads`, `activeConversations`, `handoffs`,
  `appointments.proposed`, `appointments.confirmed` — las tarjetas solo se
  renderizan cuando `!loading && !error && data` (nunca ceros
  indistinguibles de error). No importa ninguna función de escritura de
  `endpoints.ts`. Todo el texto visible en español.
- **Valida:** AC-1 (llama al endpoint al montar con rango por defecto sin
  intervención), AC-2 (cinco tarjetas con las métricas correctas), AC-3
  (re-invoca al cambiar el rango), AC-4 (no invoca con rango inválido y
  muestra el mensaje), AC-5 (Spinner durante la carga), AC-6 (ErrorBanner sin
  tarjetas en cero ante error), AC-9 (ningún control mutador), AC-10 (todo en
  español) vía `frontend/src/routes/DashboardPage.test.tsx`.
- **Dependencias:** T1, T2, T3
- **Paralelizable:** no (depende de los tres anteriores)

## T5 — Ruta `/dashboard` en `App.tsx`

- **Dificultad:** low
- **Descripción:** En `frontend/src/App.tsx`, agregar una ruta hija
  `/dashboard` bajo el layout autenticado que renderiza `DashboardPage`
  (T4). No modificar el índice (`Navigate to="/leads"`) ni ningún otro
  comportamiento de arranque existente (decisión aprobada por el usuario:
  ruta aditiva, sin cambiar la home). Sin guardia de rol adicional a la ya
  vigente de sesión válida.
- **Valida:** AC-1 (la ruta existe y monta `DashboardPage`), AC-8 (accesible
  para `OWNER` y `AGENT` sin restricción de rol adicional) vía
  `frontend/src/App.test.tsx` (caso nuevo para `/dashboard`, sin romper el
  caso existente de `/` → `/leads`).
- **Dependencias:** T4
- **Paralelizable:** no

## T6 — Link "Panel" en `AppLayout`

- **Dificultad:** low
- **Descripción:** En `frontend/src/routes/AppLayout.tsx`, agregar un
  `Link to="/dashboard"` con el texto "Panel" (etiqueta aprobada por el
  usuario), visible para ambos roles (`OWNER` y `AGENT`), junto al link
  existente de "Leads" y sin guardia de rol adicional. No tocar el link
  OWNER-only de gestión de personas.
- **Valida:** AC-8 (link visible para ambos roles) vía
  `frontend/src/routes/AppLayout.test.tsx` (caso nuevo para el link "Panel").
- **Dependencias:** ninguna (no depende de que `/dashboard` ya exista para
  poder escribir el link y su test; sí depende de T5 para que el link no
  navegue a una ruta rota en un e2e de navegación real — ver nota de orden
  de ejecución)
- **Paralelizable:** sí (en implementación); recomendable integrarla después
  de T5 si hay un test de navegación end-to-end que hace click y verifica el
  contenido de la página destino

---

## Hueco de cobertura a resolver

- **AC-7** (aislamiento multi-tenant: 403 ante `tenantId` cruzado) no tiene
  una tarea frontend dedicada porque el frontend no puede violar el
  aislamiento (el `tenantId` viene de `useAuth()`, no editable por la
  persona) y el 403 ya lo garantiza el backend vigente (fuera de alcance de
  esta fase). Cobertura recomendada: un test de integración en
  `DashboardPage.test.tsx` (dentro de T4) que simule una respuesta 403 de
  `getMetrics` y verifique que se muestra el `ErrorBanner` sin pintar
  métricas — esto ya está cubierto por el mismo camino de error que AC-6.
  Si el aceptance-test-writer generó un AC-7 específico separado del de
  error genérico, debe mapearse explícitamente a ese mismo test de T4;
  no amerita una tarea nueva.

---

## Orden de ejecución sugerido

**Grupo 1 (paralelo, sin dependencias):** T1, T2, T3, T6 (la escritura del
link y su test unitario no dependen de que `/dashboard` esté cableada).

**Grupo 2 (secuencial, depende del Grupo 1):** T4 depende de T1 + T2 + T3.

**Grupo 3 (secuencial, depende del Grupo 2):** T5 depende de T4.

**Verificación final:** si existe un test de navegación end-to-end que
recorre "click en Panel → ver el dashboard", correrlo recién después de T5 y
T6 completas, aunque ambas tareas se hayan implementado en paralelo antes.
