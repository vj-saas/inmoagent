---
name: t18-admin-properties-portal-e2e-neighborhood-normalization
description: Al armar fixtures e2e con `neighborhood` derivado de un enum/label en mayúsculas (ej. PropertyStatus.PAUSED), hay que normalizar a minúsculas antes de reusar ese mismo string como filtro de búsqueda
metadata:
  type: feedback
---

En `test/admin-properties-portal.e2e-spec.ts` (T18 de
`specs/V-D-portal-propiedades/tasks.md`), el caso de AC-8 (`PATCH
:id/status` + `PropertySearchService`) creaba una propiedad con
`neighborhood: \`estado-${status}-...\`` donde `status` es un valor de
`PropertyStatus` (`'PAUSED'`, `'RESERVED'`, etc., en mayúsculas). `create()`
normaliza el barrio con `normalizeNeighborhood` (minúsculas, sin tildes) antes
de guardar, pero el test reusaba la variable original (con mayúsculas) para
armar el filtro de `PropertySearchService.search(...)`. Resultado: la
propiedad recién creada nunca aparecía ni siquiera ANTES del cambio de
estado, dando un falso positivo de "AC-8 funciona" con un test que en
realidad nunca ejercitó el camino real.

**Por qué:** cualquier fixture de e2e que use un valor derivado de un enum
como parte de un campo que el service normaliza (barrio, etc.) tiene que
pasar por la misma normalización antes de usarse en la aserción, o el
mismatch de casing hace que el test falle (o peor, "pase" por casualidad si
la aserción está invertida).

**Cómo aplicar:** al escribir e2e nuevos que llamen directamente a un
service (`app.get(PropertySearchService)`, patrón de
`test/property-search.e2e-spec.ts`) en vez de pasar por el endpoint HTTP,
usar SIEMPRE el mismo string ya normalizado (`.toLowerCase()` como mínimo)
tanto al crear el fixture como al armar el filtro. Ver también
[[admin-leads-e2e-cross-tenant-403-vs-401]] para el patrón de reusar
`test/admin-guard-composite.e2e-spec.ts` (sesión OWNER/AGENT) en vez de
reconstruir esa infraestructura.

Además: el patrón de "combinar todos los filtros" en un test de listado
(`neighborhood`+`operation`+`price`+`rooms`+`q`) es frágil si alguna
propiedad de control usa el mismo `tag`/`q` en el título pero además
comparte, por descuido, el resto de los campos con la propiedad que sí
debería matchear en solitario — hay que revisar que CADA propiedad de
control difiera en AL MENOS un filtro real, no solo en el título.
