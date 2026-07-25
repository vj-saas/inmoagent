---
name: updateconfig-empty-dto-read-pattern
description: TenantsAdminService.updateConfig — PATCH vacío no debe llamar a prisma.tenant.update, usar findFirst con el mismo select
metadata:
  type: project
---

`TenantsAdminService.updateConfig(tenantId, dto)` (T4 de specs/V-C-onboarding-tenant)
arma `data: Prisma.TenantUpdateInput` campo por campo comprobando `dto.campo !== undefined`
para cada uno de los 11 campos — nunca spread crudo del dto (eso es la protección real
de AC-3, más allá del whitelist del ValidationPipe).

**Why:** un PATCH sin campos presentes es idempotente y no debe mover `updatedAt` del
tenant. Si simplemente se llama a `prisma.tenant.update({ data: {} })` igual se ejecuta
un UPDATE (aunque no cambie nada) y Prisma toca `updatedAt` si el modelo tiene
`@updatedAt`. Por eso hay que ramificar: `Object.keys(data).length === 0` → leer con
`findFirst({ where: { id: tenantId }, select: TENANT_CONFIG_SELECT })` en vez de
actualizar.

**How to apply:** al testear este patrón con mocks de Prisma, extender el `build()`
existente del spec (no crear un mock nuevo) agregando `update` y `findFirst` al mock de
`prisma.tenant`, siguiendo el mismo estilo que ya usa el archivo para
`webhookEvent`/`lead`. Ver también [[update-tenant-config-dto-select-pattern]] y
[[tenantsadmin-webhookstatus-mock-pattern]] para el patrón de mock compartido en ese
archivo.

Normalización: strings opcionales (excepto `botName`/`botTone`, que el DTO ya exige
no vacíos) se normalizan con `trim()` y, si quedan vacíos, se persisten como `null`.
Arrays (`coverageAreas`, `competitorsToAvoid`) se pasan tal cual si vienen presentes,
incluyendo `[]` para limpiar la lista — no se normalizan a null.
