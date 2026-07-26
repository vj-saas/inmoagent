---
name: t14-propertystatuscontrol-pattern
description: patrón de PropertyStatusControl.tsx (T14, V-D-portal-propiedades), control de un solo campo calcado de AssignmentControl
metadata:
  type: project
---

`PropertyStatusControl.tsx` (T14) es un control dedicado a cambiar el `status`
de una `Property` (`ACTIVE`/`PAUSED`/`RESERVED`/`SOLD_OR_RENTED`), separado del
`PropertyForm` de edición general. Calcado del patrón de
`AssignmentControl.tsx` (leads): `useApi` sobre la función tipada de
`endpoints.ts` con cast `as unknown as (...args) => Promise<T>`, botón
"Guardar" con `disabled={loading}`, error expuesto en un div con testid
`-error` y mensaje genérico en español, `onUpdated` recibe la entidad
devuelta por el PATCH.

Decisión propia (no pedida explícitamente por la spec pero razonable): el
botón de guardar también se deshabilita si `selectedStatus === property.status`
(no tiene sentido hacer PATCH sin cambios). Si una tarea futura necesita permitir
re-enviar el mismo estado, sacar esa condición.

**Why:** T9 ya definía `updatePropertyStatus(tenantId, propertyId, status,
token)` con un PATCH de un solo campo; no había necesidad de reinventar el
patrón de useApi + touched-state que ya raytea AssignmentControl.

**How to apply:** ver [[t14-propertystatuscontrol-pattern]] si se agrega un
control similar de un solo campo en `properties/`. Relacionado:
[[assignmentcontrol-partial-patch-pattern]] (el patrón fuente, aunque acá no
hay semántica parcial porque solo hay un campo).
