---
name: argon2-suite-flake
description: password.util.spec.ts (argon2 verify) puede fallar en la corrida jest completa por timeout bajo carga concurrente, no en aislamiento
metadata:
  type: project
---

`auth/password.util.spec.ts` (tests de `verifyPassword` con argon2) a veces
falla en `npx jest` (suite completa) pero pasa aislado (`npx jest password.util`).

**Why:** argon2 es intensivo en CPU/memoria; con muchos suites en paralelo el
verify excede el timeout. Es un flake de entorno, no un bug de código.

**How to apply:** si la suite completa reporta 2 fallas en password.util pero tu
cambio no toca auth/argon2/DB, correlo aislado para confirmar que es el flake y
no una regresión tuya. Guards con mocks puros (ej. [[MEMORY]] PersonOrApiKeyGuard)
no lo tocan.
