---
name: admin-leads-getone-pattern
description: Patrón findFirst+tenantId para nuevos endpoints de detalle en admin-leads.controller.ts
metadata:
  type: project
---

`AdminLeadsController` ya tenía 3 handlers (`messages`, `release`, `suppress`) que resuelven
tenant scoping con `findFirst({ where: { id, tenantId } })` + `NotFoundException` genérico si
no hay match (nunca busca por `id` solo). Se agregó `getOne()` (GET /:leadId) siguiendo
exactamente ese patrón, sin `include` de `messages` y devolviendo el objeto Prisma completo
(sin mapper), igual que `list()`.

**Por qué:** el equipo (task-splitter) clasifica esto como medium mientras el `where`/`findFirst`
tenga `tenantId` en la misma query — si alguna vez se agrega un `findFirst` por `id` solo y
se compara tenant después, eso es un oráculo cross-tenant y sube a high de inmediato.

**Cómo aplicar:** para cualquier endpoint nuevo de detalle/acción sobre `Lead` en este
controller, replicar `findFirst({ id: leadId, tenantId })` + 404 unificado, tal cual los
handlers existentes.

También: `ListLeadsQueryDto.state` pasó de `ConversationState` único a `ConversationState[]`
con `@Transform` que normaliza string único y array (`Array.isArray(v) ? v : [v]`), más
`q?: string` para búsqueda libre. El controller combina el `where` con `AND: [...]` a nivel
raíz para poder agregar `state.in` y `OR` de phone/name condicionalmente sin pisar el filtro
de `tenantId`.
