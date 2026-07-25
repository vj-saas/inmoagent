# Checklist responsive 375px — Fase V-B (T12)

> Evidencia de AC-8 y AC-9. jsdom no tiene motor de layout (no aplica CSS,
> todo `offsetWidth`/`scrollWidth` da 0 o valores no representativos), así que
> no existe un test automatizado en Vitest que mida overflow horizontal real
> ni corte visual de elementos. Esto es una limitación conocida, documentada
> en `plan.md` ("Verificación de 375px"), no un olvido de esta tarea.
>
> Lo que SÍ está hecho y verificado automáticamente antes de este checklist:
>
> - Gate de grep: cero `style={` y cero `CSSProperties` bajo
>   `frontend/src/routes/` y `frontend/src/components/` (AC-1).
> - Gate de grep: cero hex/`rgb(`/`rgba(` y cero tamaños o radios en píxeles
>   hardcodeados fuera de `frontend/src/styles/theme.css` (AC-3).
> - Gate de grep contra anchos fijos en píxeles (`w-[Npx]`, `min-h-[Npx]`,
>   etc.) en `routes/` y `components/`.
> - `frontend/src/routes/responsive-guardrails.test.tsx`: renderiza las 8
>   rutas migradas y verifica que toda tabla (`<table>`) esté anidada dentro
>   de un contenedor con la clase `overflow-x-auto` (el `TableScroll` de
>   `components/ui/Table.tsx`). Esto cubre la causa raíz más común de scroll
>   horizontal, pero NO es lo mismo que medir `scrollWidth`/`clientWidth` en
>   un viewport real de 375px.
>
> **Pendiente, honesto:** la inspección visual real en un navegador a
> 375x667 (columna "Resultado" de esta tabla, comparación
> `document.documentElement.scrollWidth` vs `clientWidth`, y la revisión
> visual de nav/tablas/formularios/targets táctiles ≥40px de AC-9) NO fue
> ejecutada por este agente — no tiene acceso a un navegador real con motor
> de layout. Queda para que un humano la ejecute con el procedimiento
> descripto abajo, antes de dar por cerrado AC-8/AC-9 al 100%.

## Procedimiento (para quien ejecute la verificación manual)

1. `npm run dev` en `frontend/`, abrir la app en un navegador real.
2. DevTools → modo responsive → viewport fijo **375 x 667**.
3. Para cada ruta de la tabla de abajo, navegar a ella con datos reales o
   mockeados (según corresponda) y en la consola del navegador correr:
   ```js
   document.documentElement.scrollWidth === document.documentElement.clientWidth
   ```
   `true` = sin scroll horizontal de página (AC-8). Si da `false`, anotar el
   elemento causante (inspeccionar con el selector `*` y comparar
   `offsetWidth` contra 375).
4. Inspección visual (AC-9): nav de `AppLayout` sin cortes ni superposición,
   tablas legibles (con o sin scroll propio vía `overflow-x-auto`),
   formularios usables sin overflow, y que los targets táctiles (botones,
   inputs, links de nav) midan al menos 40px de alto.
5. Registrar el resultado en la fila de la ruta correspondiente.

## Resultado por ruta

| Ruta | Viewport | scrollWidth == clientWidth | Nav sin cortes/superposición | Tablas usables | Formularios usables | Targets táctiles ≥40px | Estado |
| --- | --- | --- | --- | --- | --- | --- | --- |
| LoginPage | 375x667 | PENDIENTE (requiere navegador real) | N/A (sin `AppLayout`) | N/A | PENDIENTE | PENDIENTE | Automatizado OK, inspección visual manual pendiente |
| DashboardPage | 375x667 | PENDIENTE | PENDIENTE | N/A (tarjetas, sin tabla) | N/A | PENDIENTE | Automatizado OK, inspección visual manual pendiente |
| LeadsPage | 375x667 | PENDIENTE | PENDIENTE | PENDIENTE (tabla envuelta en `TableScroll`, confirmado por grep/test) | PENDIENTE (filtros) | PENDIENTE | Automatizado OK, inspección visual manual pendiente |
| LeadDetailPage | 375x667 | PENDIENTE | PENDIENTE | N/A (tarjetas/timeline, sin tabla) | PENDIENTE (notas, asignación) | PENDIENTE | Automatizado OK, inspección visual manual pendiente |
| AgendaPage | 375x667 | PENDIENTE | PENDIENTE | PENDIENTE (tabla envuelta en `TableScroll`, confirmado por grep/test) | N/A | PENDIENTE | Automatizado OK, inspección visual manual pendiente |
| CallQueuePage | 375x667 | PENDIENTE | PENDIENTE | N/A (filas expandibles con `Card`, sin `<table>`) | PENDIENTE (formulario de registro de llamada) | PENDIENTE | Automatizado OK, inspección visual manual pendiente |
| PeoplePage | 375x667 | PENDIENTE | PENDIENTE | PENDIENTE (tabla envuelta en `TableScroll`, confirmado por grep/test) | PENDIENTE (alta de persona) | PENDIENTE | Automatizado OK, inspección visual manual pendiente |
| AppLayout | 375x667 | PENDIENTE | PENDIENTE (nav única, `overflow-x-auto` propio confirmado por código y tests) | N/A | N/A | PENDIENTE | Automatizado OK, inspección visual manual pendiente |

## Notas

- Las columnas marcadas "confirmado por grep/test" están verificadas por
  `responsive-guardrails.test.tsx` (existencia de `TableScroll`/
  `overflow-x-auto` en el DOM) o por lectura de código, no por medición de
  layout real.
- Ninguna fila de "PENDIENTE" fue completada con datos inventados: si un
  humano ejecuta el procedimiento y encuentra un problema, esta tabla debe
  actualizarse con el resultado real y, si corresponde, reabrir una tarea de
  fix puntual.
