---
name: leadmodebadge-t14-pattern
description: LeadModeBadge/resolveLeadMode (B2-bandeja-manual T14) — punto único de derivación de modo del lead, reusar en LeadDetailPage/LeadRow/ManualReplyBox
metadata:
  type: project
---

`frontend/src/components/leads/LeadModeBadge.tsx` exporta `resolveLeadMode(state: string): 'MANUAL' | 'OPTED_OUT' | 'AI'`
(orden fijo: HUMAN_HANDOFF -> MANUAL, OPTED_OUT -> OPTED_OUT, todo lo demás -> AI por default
seguro) y el componente `<LeadModeBadge state={...}>` que usa `Badge` del design system con
`tone` warning/danger/success. Copiado del patrón de `AppointmentStatusBadge.tsx`
(`frontend/src/components/agenda/`): `Record<Estado, tone>` + `Record<Estado, label>` +
`data-testid` en el Badge.

**Why:** spec.md de B2-bandeja-manual marca T14 como el único punto de derivación de "modo
del lead" que tareas futuras (LeadDetailPage, LeadRow, ManualReplyBox) van a reusar — la firma
tiene que quedar estable, no reinventar el mapeo en cada consumidor.

**How to apply:** si una tarea futura necesita saber si un lead está en modo manual/IA/opt-out,
importar `resolveLeadMode` de este archivo en vez de comparar `state` a mano. `Badge` usa prop
`tone` (no `color`) — ver [[t9-callqueue-migration-pattern]] y hermanos para el resto del design
system.

Nota de entorno: al correr `npx vitest run` completo encontré 1 test rojo pre-existente en
`LeadDetailPage.test.tsx` (release-handoff-button) causado por cambios de OTRA tarea en paralelo
(`ReleaseHandoffButton.tsx` modificado, no por mí — confirmado con `git status`). No es mío,
no lo toqué. Si esto se repite, correr `git status` para distinguir fallas propias de fallas de
tareas paralelas antes de asumir que rompiste algo.
