---
name: endpoints-t9-property-typing
description: T9 (V-D-portal-propiedades) — tipado real de Property en endpoints.ts, divergencias entre spec y backend real
metadata:
  type: project
---

Al tipar `Property`/`ListPropertiesResponse` en `frontend/src/api/endpoints.ts`
(T9), la spec (`tasks.md`) y el backend real (`properties-admin.service.ts`,
`prisma/schema.prisma`) no coincidían en dos puntos — resueltos verificando
contra el código real, como pide la propia tarea:

1. El campo es `garage: boolean` en el modelo Prisma, **no** `hasGarage` como
   decía el texto de la tarea. Se usó `garage` (coincide además con
   `CreatePropertyRequest.garage` que ya existía en el archivo).
2. `PropertiesAdminService.list` devuelve `{ properties, total, page,
   pageSize }` (confirmado también en `test/admin-properties.e2e-spec.ts`),
   no `{ items, ... }`. Como el contrato pedido por T9 para T10-T16 es
   `ListPropertiesResponse.items`, se mapeó en el propio `listProperties()` de
   `endpoints.ts` (`.then(({ properties, ... }) => ({ items: properties,
   ... }))`) en vez de romper el nombre real del backend.
3. `price`/`expenses` son `Decimal` de Prisma → se tipan como `string` (no
   `number`), mismo criterio que `Lead.fMaxPrice` ya usado en el archivo.

**Por qué:** evita que T10-T16 (que consumen este contrato) hereden un campo
inexistente o un tipo que rompe en runtime.

**Cómo aplicar:** antes de tipar una respuesta de endpoints.ts contra la spec,
grepear el service/controller real y, si hay Decimal, revisar cómo se tipó ya
en otro modelo del mismo archivo. Ver también [[t1-list-properties-filters-shared-file]].

Efecto colateral: `OnboardingWizardPage.tsx` tenía un cast local
`as Promise<PropertiesListResult>` porque `listProperties` devolvía
`unknown` — se reemplazó por el tipo real y se actualizó su test (mock de
`properties: []` → `items: []`). Al tipar un endpoint que antes era `unknown`,
buscar consumidores existentes con casts locales tipo `as Promise<...>` y
limpiarlos.
