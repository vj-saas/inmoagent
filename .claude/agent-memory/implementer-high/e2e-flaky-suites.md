---
name: e2e-flaky-suites
description: Suites e2e que fallan de forma no determinista y no bloquean cambios ajenos a su módulo
metadata:
  type: project
---

`test/webhook.e2e-spec.ts` (assert de p95 < 500ms) y `test/conversation-engine.e2e-spec.ts`
(casos LLM de docs/03-CONVERSACION.md §7) fallan de forma intermitente por timing/LLM,
no por regresión de código.

**Why:** el webhook mide latencia p95 real (sensible a carga de la máquina) y
conversation-engine depende del LLM (respuestas variables / requiere API key).

**How to apply:** al validar una tarea ajena a `webhook`/`conversation`, si solo
fallan estas dos suites y las tuyas pasan, no es regresión tuya. Correr en verde
las suites del módulo tocado (para auth: `auth-me`, `auth-login`,
`auth-people-management`, `auth-isolation`).
