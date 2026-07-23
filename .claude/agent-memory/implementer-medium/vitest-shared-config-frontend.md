---
name: vitest-shared-config-frontend
description: frontend/ usa un unico vitest.config.ts compartido por todas las tareas de tests; coordinar si dos tareas paralelas lo crean a la vez
metadata:
  type: project
---

En specs/A2-frontend-base, T8 (http-client) y T9 (session-store) corrieron en
paralelo y ambas necesitaban vitest. package.json ya tenia `vitest` agregado
por T8 cuando arranque T9, pero faltaba `vitest.config.ts` (entorno jsdom) y
la dependencia `jsdom`. Tuve que agregarlos yo mismo porque session-store.ts
usa `sessionStorage`, que requiere entorno jsdom (T8 no lo necesitaba si
http-client no toca el DOM).

**Por que:** si dos implementers tocan `frontend/package.json` o crean
`vitest.config.ts` a la vez, el segundo en escribir puede pisar al primero.

**Como aplicar:** antes de agregar test runner/config en `frontend/`, leer el
`package.json` actual (no asumir que esta vacio) y correr `npx vitest run`
completo (no solo el archivo propio) para confirmar que no rompiste los tests
de otra tarea paralela.
