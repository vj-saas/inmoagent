---
name: propertieslist-t11-callback-pattern
description: T11 (V-D-portal-propiedades) — PropertiesList.tsx presentacional, callbacks por fila sin embeber PropertyStatusControl/DeletePropertyButton
metadata:
  type: project
---

`PropertiesList.tsx` (T11) recibe `items: Property[]` y tres callbacks por fila
(`onEdit`, `onChangeStatus`, `onDelete`), cada uno recibiendo la `Property`
completa de la fila, no solo el `id`. No embebe `PropertyStatusControl` (T14)
ni `DeletePropertyButton` (T15) — esos son componentes construidos en paralelo
por otros implementers; la tabla solo dispara botones simples que el
orquestador (`PropertiesPage`, T16) usa para abrir/montar esos componentes.
Evita acoplar T11 a la forma final de T14/T15 y evita conflictos de merge.

Labels de operación/estado (`OPERATION_LABELS`, `STATUS_LABELS`) se definieron
localmente en el componente en español porque no existía mapeo compartido en
el resto del frontend (se grepeó `RESERVED`/`SOLD_OR_RENTED`/`PAUSED` antes de
escribirlo). Si `PropertyStatusControl` (T14) define su propio mapeo, revisar
si conviene extraerlo a un helper compartido en una tarea de limpieza
posterior — no se tocó eso acá para no invadir el archivo de otro implementer.

**Por qué:** ver [[endpoints-t9-property-typing]] para el tipo `Property` real
(`garage`, no `hasGarage`; `price`/`expenses` como `string`).

**Cómo aplicar:** al escribir componentes de tabla que integran acciones de
otros componentes en construcción paralela, exponer solo callbacks con el
objeto completo de la fila, no intentar importar/mockear el componente ajeno
que todavía no existe o está en otra rama de trabajo.
