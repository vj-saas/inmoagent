---
name: t18-tenantconfigpage-no-get-endpoint
description: T18 (onboarding) TenantConfigPage sin GET de config del backend; form arranca vacío y se completa tras primer submit
metadata:
  type: project
---

`AdminTenantsController` (`src/admin/tenants/admin-tenants.controller.ts`) solo
expone `PATCH :tenantId/config` y `GET :tenantId/webhook-status` — no hay GET
dedicado para leer la config actual del tenant. `TenantConfigPage.tsx` no
agrega ese endpoint (no estaba en el alcance de T18) ni bloquea la tarea por
esto: pasa `initialConfig` como `undefined` y el form arranca vacío,
completándose recién con el primer `onSaved` exitoso — mismo patrón que
`OnboardingWizardPage` (T17) usa para su `ReadinessChecklist`.

**Why:** la tarea explícitamente permite esta salida ("documentá la
limitación... sin bloquear la tarea") si no existe un GET real. Confirmar
siempre contra el controller real antes de asumir que hay que agregar un
endpoint nuevo a `endpoints.ts`.

**How to apply:** si en el futuro se agrega un GET de config al backend,
alcanza con reemplazar el `useState` de `savedConfig` en `TenantConfigPage`
por un fetch inicial (patrón `useApi` + `useEffect`, como en
`WebhookStatusCard`). Restricción por rol de `/configuracion` calcada
exactamente de `/people`: solo se oculta el link de nav en `AppLayout` para
no-OWNER, sin guard de ruta propio — ver [[leaddetailpage-orchestrator-t11]]
para el criterio general de no inventar mecanismos nuevos cuando ya hay uno
establecido en el proyecto.
