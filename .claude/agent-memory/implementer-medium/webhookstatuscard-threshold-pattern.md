---
name: webhookstatuscard-threshold-pattern
description: WebhookStatusCard (onboarding) usa umbral de 24hs de UI para distinguir "conectado" de "sin eventos recientes", y siempre muestra disclaimer de producto
metadata:
  type: project
---

`frontend/src/components/onboarding/WebhookStatusCard.tsx` (T15,
V-C-onboarding-tenant) clasifica `getWebhookStatus()` en 3 estados de UI:
inactive (nunca conectado), pending (conectado pero `lastEventAt` > 24hs),
active (conectado y reciente). El umbral de 24hs (`RECENT_EVENT_THRESHOLD_MS`)
es una heurística puramente de frontend, no viene del backend — está
documentado en comentario junto a la constante.

**Why:** la spec exige dejar explícito en todo momento que `connected: true`
solo significa "vimos tráfico entrante", no que Meta confirmó la suscripción
del webhook (el backend no puede verificarlo activamente contra la API de
Meta). Si se toca este componente, no sacar el `data-testid="webhook-status-disclaimer"`
ni su texto — hay tests que lo verifican en los 3 estados.

**How to apply:** si otra tarea necesita reusar el patrón de "estado con
umbral de tiempo heurístico de UI", seguir el mismo enfoque: constante nombrada
+ comentario explicando que es heurística de frontend, no dato del backend.
