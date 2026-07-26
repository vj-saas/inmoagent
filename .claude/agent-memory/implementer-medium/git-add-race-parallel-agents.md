---
name: git-add-race-parallel-agents
description: git add <archivo-especifico> puede terminar commiteando archivos de OTRO agente si corren en paralelo sobre el mismo directorio nuevo
metadata:
  type: feedback
---

Al hacer `git add <archivo1> <archivo2>` y `git commit` en pasos separados,
otro agente corriendo en paralelo (ej. T14 mientras yo hacía T12, ambos en
`frontend/src/components/properties/`, directorio recién creado y compartido)
puede ejecutar su propio `git add` sobre SUS archivos entre mi `add` y mi
`commit`. El commit resultante incluye archivos de ambos aunque yo solo haya
pedido `git add` de los míos, porque `git commit` (sin `-- <pathspec>`) commitea
todo lo que esté en el índice al momento de correr, no solo lo que yo agregué
en mi propio comando.

**Por qué:** el índice de git es compartido por todos los procesos que operan
sobre el mismo working tree; no hay aislamiento por proceso/agente.

**Cómo evitarlo:** después de `git commit`, correr `git show --stat HEAD` y
comparar contra los archivos que yo tocué en la tarea. Si aparece algo de más
(archivo de otra tarea/componente que no toqué), arreglarlo con un commit de
seguimiento que haga `git rm --cached` de esos archivos (NO `git rm` a secas,
para no borrar el trabajo del otro agente del disco) y aclarar en el mensaje
que fue una carrera con trabajo paralelo. No usar `--amend` para esto: preferir
un commit nuevo, como indica la política general del proyecto.
