---
name: propertyfilters-t10-select-rooms-decision
description: T10 (V-D-portal-propiedades) PropertyFilters — rooms se implementó como Select (no input numérico debounceado) por ambigüedad de la spec
metadata:
  type: project
---

La spec de T10 lista los controles de `PropertyFilters` como `status,
operation, neighborhood, minPrice, maxPrice, rooms, q`, pero la lista de
campos debounceados es explícitamente `q, minPrice, maxPrice, neighborhood`
— `rooms` queda fuera de ambos grupos ("selects inmediatos" y "inputs
debounceados"). Se resolvió tratando `rooms` como un tercer `Select` (opciones
fijas 1-5, "Cualquiera" = sin filtro) que dispara `onChange` inmediatamente,
igual que `status`/`operation`.

**Why:** un input de texto/número para `rooms` habría requerido debounce
(no estaba en la lista explícita) o disparo inmediato por tecla (inconsistente
con el resto de números). Tratarlo como select exacto además calza con la nota
de negocio ya presente en la spec ("rooms exacto excluye propiedades sin
ambientes cargados"): la UI solo ofrece valores exactos, no rangos.

**How to apply:** si una tarea futura de este proyecto vuelve a tocar
`PropertyFilters.tsx` o el filtro `rooms` de `ListPropertiesQuery`, verificar
primero si esta decisión sigue vigente (grep `property-filter-rooms` en
`PropertyFilters.tsx`) antes de asumir que es un input de texto.
