---
name: appcontext-logout-already-calls-endpoint
description: AuthContext.logout() ya invoca endpoints.logout internamente; los consumidores (AppLayout, etc.) no deben llamar api.logout por su cuenta
metadata:
  type: project
---

En agente-inmo/frontend, `AuthContext.logout()` (src/auth/AuthContext.tsx, T10)
ya hace `endpoints.logout(token)` + `clearSession()` + reset de estado. Tareas
posteriores como T13 (AppLayout) que dicen "invoca api.logout y AuthContext.logout"
solo necesitan llamar `useAuth().logout()` — llamar a `endpoints.logout` directo
además sería duplicar la invalidación de sesión en el backend.

**Por qué:** la spec de tasks.md describe el flujo end-to-end (backend + frontend)
pero la implementación ya centraliza eso en AuthContext.

**Cómo aplicar:** antes de implementar una tarea de UI que menciona "invoca
api.X y AuthContext.Y", releer AuthContext.tsx para ver si Y ya engloba a X.
