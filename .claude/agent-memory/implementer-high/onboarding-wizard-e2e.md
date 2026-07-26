---
name: onboarding-wizard-e2e
description: Cómo se encadena el e2e del wizard de onboarding (T19) y por qué webhook-status da connected:true sin esperar la cola
metadata:
  type: project
---

`test/onboarding-wizard.e2e-spec.ts` (T19 de specs/V-C-onboarding-tenant) encadena 7 pasos HTTP en `it`s sucesivos que comparten `tenantId`/`apiKey`/`ownerToken` por variables del `describe` (Jest corre los tests de un archivo en orden).

**Why:** AC-13 exige que el alta sea 100% por HTTP; usar Prisma para *preparar* fixture invalidaría el AC. Prisma solo verifica estado.

**How to apply:**
- La app del test debe crearse con `createNestApplication({ rawBody: true })` + `ValidationPipe({ whitelist, transform })`, igual que `src/main.ts`; sin `rawBody` la firma HMAC del webhook falla.
- `WebhookController.receive()` **espera** a `handlePayload()` antes de responder 200, y `recordWebhookEvent()` persiste el `WebhookEvent` antes de encolar → `GET webhook-status` da `connected: true` inmediatamente, sin esperar al worker.
- El encolado se verifica por el buffer de debounce en Redis (`debounce:{tenantId}:{leadId}`), mismo mecanismo que [[composite-guard-e2e]] / `test/webhook.e2e-spec.ts`, porque el worker consume el job casi al instante.
- Import CSV: `errors[].row` es 1-indexado **contando el encabezado** (fila 2 = primera fila de datos). Auth del import es `PersonOrApiKeyGuard`, funciona con `X-Api-Key`.
- Cleanup: ver [[webhookevent-no-fk-cleanup]] — borrar `webhookEvent` por `tenantId` a mano; el resto cascadea desde `Tenant`.
