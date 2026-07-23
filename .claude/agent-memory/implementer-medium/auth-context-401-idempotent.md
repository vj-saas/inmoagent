---
name: auth-context-401-idempotent
description: Patrón para probar y garantizar idempotencia del reset de sesión ante 401 concurrentes en AuthContext
metadata:
  type: project
---

`AuthContext.tsx` (frontend) registra `onUnauthorized` de `http-client` UNA vez
en un `useEffect` con deps `[]`. El reset de sesión usa un `useRef` de flag
(`resettingRef`) para que llamadas repetidas al callback no crasheen ni logueen
múltiples veces — se resetea el flag inmediatamente después de limpiar, así
futuros 401 reales sí disparan el reset (no es un debounce permanente).

**Why:** T10 pedía explícitamente idempotencia ante 401 concurrentes; un
simple `if (session === null) return` no alcanza si el estado se lee stale
dentro del closure del callback registrado una sola vez.

**How to apply:** Para testear el callback de 401 sin pasar por un fetch real,
conviene `vi.spyOn(httpClient, 'onUnauthorized').mockImplementation(cb => { registeredCallback = cb })`
antes de montar el provider, y después invocar `registeredCallback()`
manualmente dentro de `act(...)`. Ver
`frontend/src/auth/AuthContext.test.tsx`.
