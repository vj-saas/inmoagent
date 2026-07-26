---
name: messagetimeline-t15-three-tones
description: T15 (V-B2) MessageTimeline con tres tonos lead/bot/humano, paleta calcada de LeadModeBadge
metadata:
  type: project
---

`resolveMessageTone(message)` en `MessageTimeline.tsx`: `IN` → 'incoming';
`OUT` con `sentByPersonId` → 'human'; `OUT` sin → 'bot'. `data-tone` expone los
tres valores (antes binario incoming/outgoing — ver [[leadmodebadge-t14-pattern]]
para el precedente de mapear estado→tono con paleta del design system).

Paleta: incoming `bg-border`, bot `bg-primary` (sin cambios), human `bg-warning`
(mismo tono que usa `LeadModeBadge` para MANUAL/HUMAN_HANDOFF, por consistencia
semántica "un humano está respondiendo"). Rótulo de email del autor humano en
un div propio con testid `message-author-{id}`, solo quand `sentByPerson` no es
null.

**Why:** el test viejo asertaba `data-tone="outgoing"` binario; había que
actualizar los 3 tests que lo usaban (dos aserciones sueltas + el test
integrador AC-4) y agregar un test nuevo para 'human' con el rótulo de email.

**How to apply:** si otra tarea toca burbujas de mensajes o badges de modo,
reusar `bg-warning` como el color "hay un humano involucrado" en vez de
inventar un color nuevo.
