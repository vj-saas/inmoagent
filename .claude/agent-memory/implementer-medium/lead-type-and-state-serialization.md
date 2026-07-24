---
name: lead-type-and-state-serialization
description: Lead/ConversationState en frontend/src/api/endpoints.ts deben calcarse del schema Prisma real, y arrays de filtros (state) se serializan con URLSearchParams.append repetido, no CSV
metadata:
  type: feedback
---

En A.3 T5 el stub de `ConversationState` en `frontend/src/api/endpoints.ts` tenía
valores inventados (SEARCH, PRESENTING, CLOSED) que no existen en
`prisma/schema.prisma` (enum real: GREETING | QUALIFICATION | SEARCH_MATCH |
SCHEDULING | HUMAN_HANDOFF | OPTED_OUT). Al tipar contra el backend siempre
verificar el enum/model real en schema.prisma, no asumir nombres "razonables".

Para filtros de tipo array en query params (ej. `state?: ConversationState[]`),
el backend (NestJS + class-validator) espera parámetros repetidos
(`?state=A&state=B`), que es lo que emite `URLSearchParams.append(key, v)` en un
loop — nunca `.set()` con join/CSV ni pasar el array directo a `.set()` (eso
serializa mal, tipo "A,B" o "[object Object]").

**Why:** el backend usa `@Transform` para normalizar tanto `?state=A` (string
único) como `?state=A&state=B` (array real de query params) — CSV no matchea
ese patrón.

**How to apply:** cuando una función de `endpoints.ts` reciba un array para un
filtro de query, usar `for (const v of arr) params.append(key, v)`.
