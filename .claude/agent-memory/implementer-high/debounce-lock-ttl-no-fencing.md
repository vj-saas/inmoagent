---
name: debounce-lock-ttl-no-fencing
description: El lock de lead de Redis (debounce:lock) tiene TTL 60s y se libera con DEL sin fencing token — límite conocido que hereda withLeadLock
metadata:
  type: project
---

El lock de lead del pipeline (`debounce:lock:<tenantId>:<leadId>`, `SET NX PX
60000`) se libera con un `DEL` plano, sin fencing token ni chequeo de dueño. Si
el titular tarda más que el TTL, el lock expira, otro actor entra, y el `DEL`
del primero borra el lock ajeno. `withLeadLock` (T5 de V-B2) hereda exactamente
esa semántica a propósito: es el mecanismo que da exclusión mutua bot-humano
(AC-7), y usar otra key o cambiar `releaseLock` rompería la exclusión contra
`tryFlush`.

**Why:** la spec V-B2 exige reusar el MISMO par `acquireLock`/`releaseLock` y la
MISMA key; introducir fencing sería un cambio de la lógica existente del
debounce, fuera del alcance de T5 y con riesgo sobre los tests sensibles de
`pipeline`.

**How to apply:** si una tarea futura mete dentro de `withLeadLock` o de
`tryFlush` una operación que pueda tardar cerca de 60s (LLM lento, envío a Meta
con reintentos, transacción larga), no asumir exclusión garantizada: proponer
primero fencing token (valor único + `DEL` condicional por Lua) o un TTL
explícito, en vez de alargar el trabajo bajo el lock. Relacionado:
[[e2e-flaky-suites]].

Además: el `releaseLock` dentro del `finally` puede enmascarar una excepción de
`fn` si Redis falla al liberar. Comportamiento idéntico al de `tryFlush`, se
dejó igual por consistencia.
