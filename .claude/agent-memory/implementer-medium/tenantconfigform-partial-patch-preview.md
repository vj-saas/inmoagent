---
name: tenantconfigform-partial-patch-preview
description: T14 (onboarding) - TenantConfigForm con Set<field> tocado + vista previa client-side, patrón reusable para otros forms de PATCH parcial
metadata:
  type: project
---

`TenantConfigForm.tsx` (paso 3 del wizard de onboarding, spec
V-C-onboarding-tenant) implementa PATCH parcial real: un `Set<FieldName>` de
campos tocados por `onChange`, y al submit se arma el dto solo con esas
claves — strings tocados se envían trim()eados incluso vacíos (`''` = borrar
campo, semántica de `TenantsAdminService.updateConfig`), arrays
(`coverageAreas`/`competitorsToAvoid`) se editan como textarea con
comma/newline-split y se envían como `[]` si tocado y vaciado.

La vista previa de los mensajes finales (saludo/handoff) se arma en el
cliente calcando la forma de `src/conversation/templates.ts`
(`buildGreetingMessage`/`buildHandoffFarewell`) pero NO tiene que ser
carácter-por-carácter idéntica — eso ya lo garantiza el backend
(`templates.spec.ts`). Si otra tarea necesita reusar esta lógica de
preview, extraerla a un util compartido en vez de copiar el texto a mano.

**Why:** evita mandar los 11 campos en cada PATCH (rompería la semántica de
"solo lo tocado se cambia") y evita duplicar/hardcodear el texto exacto del
backend en el frontend (fuente de bugs de sincronización si cambia el
guardrail).

**How to apply:** cualquier form nuevo que reuse `UpdateTenantConfigRequest`
(p.ej. `TenantConfigPage` en T18) debería reusar el mismo componente
`TenantConfigForm`, no reimplementar el tracking de tocados.

`ReadinessChecklist.tsx` (mismo T14): decisión documentada en comentario —
si `alertsEnabled` es `false`, el ítem de `alertPhone` se muestra cumplido
(no aplica), no pendiente. Ver [[t14-integration-verification-pattern]] si
existe cuando T19 valide el wizard completo.
