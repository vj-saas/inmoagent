---
name: leaddetailpage-orchestrator-t11
description: LeadDetailPage orquesta 4 useApi en paralelo; reemplazar placeholder rompe App.test.tsx si no se mockean los endpoints ahí también
metadata:
  type: feedback
---

Al reemplazar un placeholder de ruta (`LeadDetailPage`) por una versión que dispara llamadas reales a la API, hay que revisar tests de nivel superior que renderizan esa ruta sin mockear `endpoints.ts` (en este proyecto, `App.test.tsx` navegaba a `/leads/:leadId` esperando el texto placeholder sincrónico). Si no se lo actualiza, el test queda colgado en el `Spinner` (loading eterno porque el fetch real nunca resuelve en jsdom) y falla la suite completa aunque el test específico del componente (`LeadDetailPage.test.tsx`) esté bien.

**Por qué:** el placeholder no hacía I/O, así que ningún test fuera de su propio archivo dependía de mockear API. Al agregar fetch real, cualquier test de integración que monte esa ruta necesita mocks de `vi.spyOn(endpoints, 'getLead' | 'getLeadMessages' | 'getLeadNotes' | 'listAssignableUsers')` + `waitFor`.

**Cómo aplicar:** antes de dar por terminada una tarea que reemplaza un placeholder por lógica con I/O, correr la suite completa (`npx vitest run`) y no solo el archivo de test propio — grep por el nombre del componente/página en otros `*.test.tsx` (ej. `App.test.tsx`) para detectar renders indirectos que rompan.

Ver también [[leadspage-orchestration-pattern]] (mismo patrón de orquestación con `useApi` + Spinner/ErrorBanner mutuamente excluyentes, ya usado en `LeadsPage`).
