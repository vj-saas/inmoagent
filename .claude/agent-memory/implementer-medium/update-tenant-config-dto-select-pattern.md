---
name: update-tenant-config-dto-select-pattern
description: T3 de V-C-onboarding-tenant — DTO de PATCH config + whitelist de select fail-closed
metadata:
  type: project
---

`src/admin/tenants/update-tenant-config.dto.ts` (11 campos, todos `@IsOptional()`,
solo `botName`/`botTone` con `@MinLength(1)` porque son NOT NULL con default en
el schema) y `src/admin/tenants/tenant-config-response.ts`
(`TenantConfigResponse` + `TENANT_CONFIG_SELECT` como `Prisma.TenantSelect`
explícito) ya existen, commit `906e3af`.

**Por qué:** AC-1/AC-3 de la spec exigen que la whitelist de columnas sea
explícita (fail-closed), no un `delete tenant.apiKeyHash` sobre el objeto
completo — así una columna secreta nueva en `Tenant` no se filtra sola.

**Cómo aplicar:** T4 (`updateConfig()` en `tenants-admin.service.ts`) y T6
(controller) consumen estos dos archivos tal cual, no hay que tocarlos. Al
momento de cerrar T3, `tenants-admin.service.ts` ya tenía cambios locales sin
commitear de otro implementer (T4 en paralelo) — no se tocaron ni commitearon
esos cambios ajenos, solo los dos archivos nuevos de T3. No existe ningún
`*.dto.spec.ts` en el proyecto como patrón previo; no se inventó uno nuevo para
este DTO suelto (se validó solo con build + suite completa en verde).
