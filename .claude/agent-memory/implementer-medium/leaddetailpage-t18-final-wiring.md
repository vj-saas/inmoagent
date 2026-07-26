---
name: leaddetailpage-t18-final-wiring
description: T18 (V-B2, última tarea) — wiring de LeadModeBadge/header por modo/ManualReplyBox en LeadDetailPage
metadata:
  type: project
---

`LeadDetailPage.tsx` (`frontend/src/routes/LeadDetailPage.tsx`, no
`pages/`) integra los cuatro componentes de V-B2-bandeja-manual: header de
la card "Mensajes" con `data-testid="messages-card-header"` coloreado por
`MODE_HEADER_CLASSES[resolveLeadMode(lead.state)]` (`bg-warning/10` MANUAL,
`bg-danger/10` OPTED_OUT, `bg-success/10` AI — mismos tonos que
`LeadModeBadge`, ver [[messagetimeline-t15-three-tones]]), `LeadModeBadge`
al lado del título, `ManualReplyBox` bajo `MessageTimeline` en el mismo
`CardBody`.

`fetchLead`/`fetchMessages` se separaron en funciones nombradas reusables
(antes `messagesApi.run(...)` estaba inline en el `useEffect`);
`handleManualReplySent` llama a ambas para que el header cambie de color
tras el primer envío (AC-16), igual patrón que `ReleaseHandoffButton.onReleased`.

**Why:** el test de éxito necesitaba `lastInboundAt` reciente (no una fecha
fija vieja como '2026-07-01') porque `ManualReplyBox` calcula la ventana de
24hs contra `Date.now()` real — con `vi.useFakeTimers` no activado, una
fecha hardcodeada del pasado hace que el textarea salga deshabilitado y el
test de envío falle en silencio (el submit no dispara nada). Usar siempre
`new Date().toISOString()` para fixtures de `lastInboundAt` en tests que
necesitan la ventana abierta.

**How to apply:** si se toca de nuevo esta página o se agregan fixtures de
`Lead` con `lastInboundAt`, generar la fecha en runtime relativa a "ahora",
no un string ISO fijo.
