---
name: prisma-updatemany-fk-scalar
description: Para setear un FK scalar (assignedUserId) vía updateMany hay que tipar data como UncheckedUpdateManyInput, no UpdateManyMutationInput
metadata:
  type: project
---

En `updateMany`, el tipo `Prisma.<Model>UpdateManyMutationInput` EXCLUYE los campos escalares que respaldan una relación (ej. `assignedUserId` en `Appointment`, que tiene `assignedUser Person? @relation`). Setearlos ahí da TS2339 "Property does not exist".

**Solución:** tipar el objeto `data` como `Prisma.<Model>UncheckedUpdateManyInput` — la variante unchecked incluye los FK escalares directos. Usado en `AppointmentsAdminService` (B.1) para el patrón updateMany condicionado a `status` (atomicidad sin `$transaction`, ver [[patch-partial-null-vs-absent]]).

**Why:** el patrón del proyecto para transiciones de estado sin carrera es `updateMany({ where: { id, tenantId, status: <origen> }, data })` en vez de `update`, para hacer la validación de estado atómica en DB (evita TOCTOU). Ese `data` necesita el tipo unchecked si toca FKs.

**How to apply:** cuando un updateMany deba escribir un FK scalar directo, no uses la relación anidada `{ connect }` (updateMany no la soporta bien) ni el tipo mutation-input; usá `UncheckedUpdateManyInput`.
