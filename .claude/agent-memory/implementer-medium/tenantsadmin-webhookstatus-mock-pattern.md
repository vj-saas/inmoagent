---
name: tenantsadmin-webhookstatus-mock-pattern
description: Patrón de mock de PrismaService en tenants-admin.service.spec.ts al agregar métodos nuevos al mismo service
metadata:
  type: project
---

`tenants-admin.service.spec.ts` tiene un `build()` compartido que arma el mock
de `PrismaService` con un objeto plano tipo `{ tenant: { create } } as unknown as PrismaService`.
Al agregar un método nuevo al service (ej. `webhookStatus` en T5, que usa
`prisma.webhookEvent.findFirst` y `prisma.lead.findFirst`), hay que **extender
ese mismo objeto de mock** en `build()` en vez de crear un mock aislado —
mantiene todos los tests del archivo usando la misma factory y evita
duplicación.

**Por qué:** el archivo ya tenía un patrón establecido de `build()` +
`getCapturedArgs()`; romperlo en dos factories distintas (una por método)
generaría drift si mañana otro método necesita combinar mocks.

**Cómo aplicar:** si en T6 (controller) u otra tarea se agregan más métodos al
service que toquen otras tablas de Prisma, seguir extendiendo `build()` en
`tenants-admin.service.spec.ts`, no crear un `describe` con su propio setup de
mocks desde cero.

Relacionado: [[admin-leads-getone-pattern]] (mismo patrón de aislar tenantId en
queries de módulos admin, pero en `leads`).
