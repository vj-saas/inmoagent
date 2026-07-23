---
name: react-router-dom-added
description: react-router-dom no estaba en package.json del frontend hasta T11; se agregó v6.28 para ProtectedRoute/rutas
metadata:
  type: project
---

`frontend/package.json` no tenía `react-router-dom` (T11, 2026-07-23). Se
instaló `react-router-dom@^6.28.0` (v6, no v7, para evitar cambios de API
rotos y porque el resto del ecosistema de testing usado —RTL v15— es
compatible con v6 sin flags extra salvo los future-flag warnings normales
de v6, que no rompen tests).

**Por qué:** el plan de A2-frontend-base asume routing tipo SPA
(`ProtectedRoute`, `/login`, `AppLayout`) pero no se había instalado la
librería en tareas previas.

**Cómo aplicar:** si otra tarea de A2 (T12/T13/T17) también necesita
`react-router-dom`, ya está instalado — no reinstalar ni cambiar de major
version sin discutirlo, para no generar conflictos de lockfile entre
implementers paralelos.
