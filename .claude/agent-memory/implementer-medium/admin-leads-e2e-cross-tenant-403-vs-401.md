---
name: admin-leads-e2e-cross-tenant-403-vs-401
description: PersonOrApiKeyGuard da 403 solo por la rama de sesión (Bearer); por API key cross-tenant es 401, no 403
metadata:
  type: project
---

En `PersonOrApiKeyGuard` (src/admin/guards/person-or-api-key.guard.ts) el 403 de
`TenantScopeGuard` (AC-19/AC-14) solo se dispara en la rama de sesión (header
`Authorization: Bearer`). Si la request llega con `X-Api-Key` de un tenant
distinto al de la URL, el resultado es 401 (rechazo temprano en
`TenantApiKeyGuard`, camino legado), nunca 403.

**Por qué importa:** al escribir tests de regresión "tenantId de otro tenant en
la URL → 403" hay que fijarse con qué credencial se prueba. Con API key el
código correcto a esperar es 401, no 403.

**Cómo aplicar:** para cubrir el 403 real de `TenantScopeGuard` sobre
`GET /leads` y `GET /leads/:leadId`, usar el fixture con sesión (Bearer) que ya
vive en `test/admin-guard-composite.e2e-spec.ts` (tenants A/B con
`ownerTokenA`/`agentTokenA` vía `/auth/login`), no reconstruir esa infraestructura
en `test/admin-leads.e2e-spec.ts` (que solo tiene fixtures de API key). Ver
[[admin-leads-getone-pattern]].

También: el schema tiene `@@unique([tenantId, phone])` en `Lead` — al crear
varios leads de prueba con `phone` fijo/derivado del mismo `needle` en el mismo
tenant, hay que variar el prefijo (ej. `5491100${needle}` vs `5491101${needle}`)
para no chocar con la constraint única al hacer `prisma.lead.update`.
