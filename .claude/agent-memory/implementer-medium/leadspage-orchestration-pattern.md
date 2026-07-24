---
name: leadspage-orchestration-pattern
description: Patrón para LeadsPage.tsx orquestando filtro+búsqueda+paginación con useApi
metadata:
  type: project
---

`LeadsPage.tsx` (T12 de A3-bandeja-leads) sigue el mismo esqueleto que
`PeoplePage.tsx`: `useApi<T>(fn as (...args: unknown[]) => Promise<T>)`, un
`fetchX` local que llama `run(...).catch(() => {})` para evitar unhandled
rejection, y un único `useEffect` con todas las deps que disparan refetch.

Puntos no obvios:
- El reset de `page = 1` al cambiar `category`/`q` se logra seteando
  `setPage(1)` en los handlers de `LeadStateFilter`/`LeadSearchInput` ANTES
  de que el `useEffect` (que depende de `[tenantId, states, q, page]`)
  dispare el fetch — no hace falta lógica adicional de "reset explícito".
- Loading/error/vacío/datos deben ser mutuamente excluyentes en el JSX
  (`!loading && error`, `!loading && !error && data && ...`), si no el
  ErrorBanner o el Spinner conviven brevemente con contenido viejo.
- `ListLeadsResponse.leads` está tipado como `unknown[]` en `endpoints.ts`
  (ver [[lead-type-and-state-serialization]]); hace falta castear a `Lead[]`
  al pasarlo a `LeadsList`.
- Test de "cambia búsqueda" necesita `timeout: 2000` en `waitFor` porque
  `LeadSearchInput` debounce ~350ms internamente.

Ver [[useapi-typed-function-cast]] para el patrón de cast de funciones de
`endpoints.ts` al pasarlas a `useApi`.
