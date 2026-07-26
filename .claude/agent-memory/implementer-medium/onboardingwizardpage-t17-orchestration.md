---
name: onboardingwizardpage-t17-orchestration
description: T17 (onboarding) — OnboardingWizardPage orquesta T12-T16; ni CsvUploader ni WebhookStatusCard exponen callback de éxito al padre
metadata:
  type: project
---

`frontend/src/routes/OnboardingWizardPage.tsx` (T17, [[t18-integration-verification-pattern]] hermano)
integra 7 componentes de onboarding en 3 pasos con estado 100% en memoria.

Hallazgos no obvios al revisar los componentes hijos antes de diseñar el wiring:
- `CsvUploader` (T13) NO expone ningún callback de éxito (`onImported` no existe):
  guarda su propio `CsvImportResult` en estado local y no lo comparte con el
  padre. Para `ReadinessChecklist.propertiesCount` en el padre hubo que hacer
  una llamada propia a `listProperties(tenantId, {}, token)` al entrar al paso 3
  (duplica trabajo, pero es la única forma sin tocar el componente de T13).
- `WebhookStatusCard` (T15) tampoco expone callback: hace su propio fetch de
  `getWebhookStatus` internamente. Mismo patrón: el padre hace su propia
  llamada duplicada a `getWebhookStatus` para alimentar `ReadinessChecklist`.
- `TenantConfigForm` (T14) sí expone `onSaved(config: TenantConfigResponse)` —
  ese es el único de los tres que se pudo levantar sin llamada duplicada.
- `listProperties` en `endpoints.ts` todavía devuelve `Promise<unknown>`
  (marcado TODO(A.5), sin tipo de respuesta público). Se declaró un tipo local
  mínimo `{ total: number }` en el archivo consumidor en vez de tocar
  `endpoints.ts` (fuera de alcance de T17), calcado del shape real del backend
  (`{ properties, total, page, pageSize }`, ver `properties-admin.service.ts`).

Patrón de retry sin recrear el tenant: `ownerPassword` (necesario para
`bootstrapOwner` y `login`, y para reintentarlos) se guarda en un `useRef`, NO
en el `useState` del wizard — se limpia (`= null`) apenas el login tiene
éxito. La master key sí vive en `useState` (se necesita visible/editable y
para reintentos de bootstrap) pero nunca se pasa a `sessionStorage`/
`localStorage` en ningún punto — verificado con `vi.spyOn(window.sessionStorage, 'setItem')`
en el test.

Cómo evitarlo la próxima: antes de diseñar wiring "obvio" (levantar estado vía
props), leer el componente hijo completo — varios de esta familia (T13, T15)
fueron diseñados a propósito como "no saben si están en el wizard", así que no
tienen mecanismo de lifting y hay que aceptar la llamada duplicada.
