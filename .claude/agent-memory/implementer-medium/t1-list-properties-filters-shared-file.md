---
name: t1-list-properties-filters-shared-file
description: T1 de V-D-portal-propiedades (filtros de listado) — properties-admin.service.spec.ts no existía, hubo que crearlo; archivo compartido con T2/T3 en secuencia
metadata:
  type: project
---

`properties-admin.service.spec.ts` no existía antes de T1 (V-D-portal-propiedades):
se creó desde cero, cubriendo solo `list()` (neighborhood/minPrice/maxPrice/rooms/q,
cada uno por separado y combinados, con normalizeNeighborhood para tildes/mayúsculas/alias).

**Por qué importa:** `properties-admin.service.ts` es tocado en secuencia por T1
(`list`), T2 (`remove`) y T3 (fotos en `update`) — mismo archivo, sin dependencia
lógica real, solo evitar conflicto de merge. El spec nuevo va a ser extendido por
T2/T3 con sus propios `describe` bloques (`PropertiesAdminService.remove`,
`.update`) — no reescribir el describe de `.list` al extenderlo, solo agregar.

**Cómo aplicar:** al implementar T2 o T3 de esta spec, leer primero
`properties-admin.service.spec.ts` tal como quedó tras T1 antes de tocarlo, y el
mock de `PrismaService` en `build()` ahí solo expone `property.findMany`/`count`
— si T2/T3 necesitan `$transaction`/`appointment`/`propertyPhoto`, extender el
mock local sin romper los tests de `list` existentes.
