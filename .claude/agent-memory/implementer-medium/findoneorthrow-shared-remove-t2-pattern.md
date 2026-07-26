---
name: findoneorthrow-shared-remove-t2-pattern
description: T2 (V-D-portal-propiedades) — findOneOrThrow compartido + remove() transaccional con validación de Appointment
metadata:
  type: project
---

`PropertiesAdminService.remove` ahora es una `$transaction` interactiva:
`findOneOrThrow(tx, ...)` (404, refactor compartido con `getOne`) →
`tx.appointment.findFirst({ where: { tenantId, propertyId } })` → si existe,
`ConflictException` (no borra); si no, `tx.property.delete(...)`.

**Why:** AC-9/AC-10 piden que no se pueda borrar una propiedad con visitas
agendadas, y `propertyId` es único mundialmente aunque `tenantId` no haga
falta para el lookup — el `where` del `findFirst` igual lleva `tenantId`
explícito como defensa contra citas huérfanas de otro tenant que bloquearían
un borrado legítimo (test que lo prueba: appointment de otro tenant sobre el
mismo `propertyId` → borra igual).

**How to apply:** al mockear Prisma en tests con `options.campo ?? default`,
cuidado si el valor válido de test es `null`/`0`/`''` — `??` no distingue
"no pasado" de "pasado como null". Usar `'campo' in options ? options.campo :
default` cuando el caso de test necesita simular explícitamente un valor falsy.
Ver [[t1-list-properties-filters-shared-file]] para el archivo compartido
entre T1/T2/T3 (`properties-admin.service.ts`), secuenciado por task-splitter
para evitar conflictos de merge.
