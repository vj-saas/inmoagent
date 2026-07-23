---
name: e2e-parallel-flake
description: La suite e2e completa (npm run test:e2e) puede fallar intermitente por workers en paralelo sobre DB compartida; re-correr o aislar confirma verde
metadata:
  type: project
---

`npm run test:e2e` (13 suites) a veces reporta 1-2 suites falladas con "worker
process failed to exit gracefully". Re-correr da 93/93 en verde, y correr las
suites afectadas en aislamiento pasa determinísticamente.

**Why:** los workers de Jest e2e comparten Postgres/Redis y compiten por seed
state / rate-limit / timers argon2 (ver [[argon2-suite-flake]]). No es un bug de
producto.

**How to apply:** al terminar una tarea backend, si la suite e2e completa falla,
re-correr una vez y/o correr las suites tocadas en aislamiento antes de asumir
regresión. Un fallo que no reproduce en aislamiento es flake, no la tarea.
