---
name: build-roto-por-agente-paralelo
description: Cuando npm run build falla en un archivo untracked de otro agente, aislar el typecheck propio con un tsconfig temporal que copie los excludes de tsconfig.build.json
metadata:
  type: feedback
---

Si `npm run build` falla en un archivo que **no tocaste**, chequeá `git status`
antes de "arreglarlo": en este repo varios implementers trabajan sobre `main` en
paralelo y un `??` (untracked) a medio escribir de otro agente rompe el build de
todos.

**Why:** en V-D (2026-07-26) `property-photo-storage.service.ts` (T5, de otro
agente) tiraba TS2538 mientras yo cerraba T6. Editarlo habría pisado trabajo en
curso; darlo por "build roto" habría bloqueado la entrega sin motivo.

**How to apply:** para validar que TU código typechequea, creá un tsconfig
temporal en la raíz que extienda `tsconfig.json` y repita **todos** los excludes
de `tsconfig.build.json` (`node_modules`, `test`, `dist`, `**/*spec.ts`,
`prisma.config.ts`, `prisma`, `frontend`, `scripts`) más el archivo ajeno; si
omitís los excludes te llueven TS6059 por `rootDir`. Corré
`npx tsc -p tsconfig.tmp.json --noEmit`, borralo, y reportá el fallo ajeno como
preexistente. Commiteá con `git add` de tus archivos explícitos, nunca `git add -A`.
Ver [[mutation-check-critical-branches]] para el otro chequeo previo al cierre.
