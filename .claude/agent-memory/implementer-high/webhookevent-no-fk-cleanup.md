---
name: webhookevent-no-fk-cleanup
description: WebhookEvent.tenantId no tiene FK contra Tenant — no cascadea; hay que limpiarlo a mano en los e2e
metadata:
  type: project
---

`WebhookEvent.tenantId` es `String?` **sin `@relation`** en `prisma/schema.prisma`:
no hay FK ni `onDelete: Cascade`.

**Why:** el webhook persiste el evento para idempotencia antes de resolver el
tenant, así que el tenant puede no existir/no resolverse todavía. Efecto
colateral: el cleanup habitual de los e2e (`prisma.tenant.deleteMany({ where: {
id: { in: tenantIds } } })`) **no** borra los `WebhookEvent` seedeados, que
quedan como basura en la DB local y compartida entre corridas (`waMessageId` es
`@unique` global, así que un id repetido entre corridas explota con P2002).

**How to apply:** en cualquier e2e que seedee `WebhookEvent`, borrar primero
`prisma.webhookEvent.deleteMany({ where: { tenantId: { in: tenantIds } } })` en
el `afterAll`, y componer `waMessageId` con el `suffix` aleatorio del spec.
`Lead`, `Message`, `Person` sí cascadean desde `Tenant`.

Relacionado: [[composite-guard-e2e]], [[prisma-migration-offline]].
