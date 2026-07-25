# Nota de Coordinación con V-B: Rutas nuevas a migrar al design system

**Fecha:** 2026-07-25  
**Contexto:** Seguimiento de coordinación entre fases V-B y V-C

## Declaración original de V-B (design-system)

En `specs/V-B-design-system/spec.md` (líneas 67-69), V-B declaró explícitamente
como **fuera de alcance**:

> "Agregar páginas o rutas nuevas."

Listó exactamente **8 rutas existentes a migrar al design system** (spec.md líneas 8-10 y 39-41):
1. `LoginPage`
2. `DashboardPage`
3. `LeadsPage`
4. `LeadDetailPage`
5. `AgendaPage`
6. `CallQueuePage`
7. `PeoplePage`
8. `AppLayout`

## Situación al cerrar V-C (onboarding-tenant)

V-C agregó **2 rutas nuevas** que rebasan lo declarado por V-B:

1. `frontend/src/routes/OnboardingWizardPage.tsx` — T17, creada en V-C
2. `frontend/src/routes/TenantConfigPage.tsx` — T18, creada en V-C

**Total de rutas en `frontend/src/routes/`:** 10 (8 originales + 2 nuevas)

## Recomendación

Estas 2 rutas nuevas (`OnboardingWizardPage`, `TenantConfigPage`) quedan como
**follow-up pendiente de incorporar a la lista de migración de V-B**. Se recomienda:

- **Opción 1:** Ampliar el scope de V-B para incluir estas 2 rutas en su ciclo de
  migración al design system (cambiaría AC-1 de 8 a 10 rutas).
- **Opción 2:** Crear una fase V-B2 dedicada a migrar estas 2 rutas + cualquier
  componente nuevo que introduzca V-C al design system (enfoque más limpio si V-B
  ya está cerrada).

**Decisión a cargo del coordinador/product owner.**
