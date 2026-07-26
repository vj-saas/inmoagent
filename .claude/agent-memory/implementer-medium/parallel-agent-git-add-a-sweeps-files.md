---
name: parallel-agent-git-add-a-sweeps-files
description: en repos sin worktrees, un agente paralelo con git add -A puede commitear tus archivos nuevos antes de que llegues a tu propio commit
metadata:
  type: feedback
---

En V-D-portal-propiedades varios agentes trabajaban en paralelo sobre archivos
nuevos distintos dentro de `frontend/src/components/properties/`. Al hacer
`git add <mis-archivos>` y luego `git commit`, el commit falló con "nothing to
commit" porque otro agente (T12, `PhotoListEditor`) ya había hecho `git add -A`
(o equivalente) y los incluyó en SU commit (`acbdbf7`) antes de que yo llegara
al mío.

**Why:** no hay worktrees separados por tarea; todos los agentes comparten el
mismo working tree y `.git`, así que cualquier `git add -A` de un agente barre
también los archivos untracked de otros agentes en curso.

**How to apply:** si tras `git add <mis-archivos> && git commit` el commit
devuelve "nothing to commit" o similar, correr `git log --oneline --all --
<mi-archivo>` y `git show --stat <commit>` para confirmar si mi contenido ya
quedó commiteado (aunque sea dentro del commit de otra tarea) antes de asumir
que algo se perdió. Si el contenido coincide con lo que escribí, la tarea está
igualmente completa — no hace falta re-commitear ni forzar nada.
