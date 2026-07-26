---
name: t3-update-photos-transaction-pattern
description: PropertiesAdminService.update ahora es transaccional para reemplazar fotos; patrón de mock de tx en tests
metadata:
  type: project
---

`update()` en `properties-admin.service.ts` pasó de un `property.update` suelto
a un `$transaction` interactivo (mismo estilo que `remove()`, T2):
`findOneOrThrow(tx, ...)` (404) → si `dto.photoUrls !== undefined`,
`tx.propertyPhoto.deleteMany({ where: { propertyId } })` seguido de
`createMany` (solo si el array no queda vacío) con `position` = índice →
`tx.property.update(...)`. Con `photoUrls === undefined` no se toca la tabla
de fotos en absoluto (AC-7).

**Why:** hallazgo 1 del plan de `V-D-portal-propiedades`: sin esto AC-11 era
inalcanzable (reordenar/reemplazar fotos vía `PATCH`). Se decidió deliberadamente
que `photoUrls: []` borra todas las fotos, divergiendo de `upsertByExternalRef`
(que solo reemplaza si el array viene con contenido) — no tocar esa otra función.

**How to apply:** para testear, extender el mock de `$transaction` con un `tx`
que exponga `property.findFirst/update` y `propertyPhoto.deleteMany/createMany`
(ver `buildForUpdate` en `properties-admin.service.spec.ts`), igual patrón que
`buildForRemove` de [[findoneorthrow-shared-remove-t2-pattern]]. Si una futura
tarea toca fotos de nuevo, revisar ambos puntos (update y upsertByExternalRef)
para no reintroducir inconsistencia.
