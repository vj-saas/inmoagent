---
name: frontend-vitest-setup
description: frontend/ (Vite+React+TS) usa vitest como test runner, no estaba en package.json y hubo que agregarlo
metadata:
  type: project
---

`frontend/` (scaffold de T7 en specs/A2-frontend-base) no traía vitest instalado
aunque `vitest.config.ts` ya existía apuntando a `src/**/*.test.ts(x)` con
`environment: 'jsdom'`. Hubo que agregar `vitest` a devDependencies y el script
`"test": "vitest run"` en package.json, y correr `npm install`.

**Why:** T8 (http-client.ts) requería tests unitarios con fetch mockeado, y sin
vitest declarado como dependencia no corrían pese a que la config ya estaba.

**How to apply:** antes de asumir que el test runner del frontend está listo,
correr `npx vitest run` o revisar `node_modules/.bin` — no alcanza con ver
`vitest.config.ts` en el repo. Si falta, agregarlo es mínimo (una dependencia +
un script).
