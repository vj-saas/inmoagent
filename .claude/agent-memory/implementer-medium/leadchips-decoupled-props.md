---
name: leadchips-decoupled-props
description: LeadChips.tsx recibe props sueltas fN* en vez de un objeto Lead completo, para no bloquearse por T5 en paralelo
metadata:
  type: feedback
---

En T7 (spec A3-bandeja-leads) se definió `LeadChipsProps` con los campos
`fOperation`/`fNeighborhoods`/`fMaxPrice`/`fCurrency`/`fMinRooms` sueltos, en
vez de recibir `lead: Lead` importado de `endpoints.ts`.

**Por qué:** la tarea en paralelo (T5) podía no estar mergeada todavía cuando
arrancó T7, y el enunciado explícitamente autoriza definir una interfaz local
mínima en vez de bloquear esperando el tipo compartido.

**Cómo aplicar:** cuando una tarea depende de un tipo que otra tarea paralela
está tocando en el mismo momento, preferir props/campos sueltos con los
mismos nombres que el modelo Prisma en vez de importar el tipo compartido —
se puede ajustar el import después sin romper la lógica interna. Esto evita
bloqueos de merge entre implementers paralelos.

También: `OperationType` en `endpoints.ts` solo tiene `SALE | RENT`, sin
`TEMP_RENT` (que sí existe en el enum Prisma real). El mapeo de labels en
`LeadChips` usa un `Record<string, string>` con fallback al valor crudo, no
un switch exhaustivo tipado — así no se rompe si el tipo se corrige después
para incluir `TEMP_RENT`.
