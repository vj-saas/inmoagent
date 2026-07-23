---
name: login-page-mocking-pattern
description: Cómo testear LoginPage con useAuth y react-router-dom mockeados sin router real
metadata:
  type: project
---

`LoginPage.tsx` (frontend/src/routes/LoginPage.tsx) usa `useAuth()` de
`AuthContext` y `useNavigate()` de react-router-dom directamente. Para testear
sin envolver en `MemoryRouter`/`AuthProvider` real, se mockean ambos módulos
con `vi.mock('../auth/AuthContext', ...)` y `vi.mock('react-router-dom', ...)`
devolviendo un `useNavigate` que retorna un `vi.fn()` capturable.

**Por qué:** más simple y rápido que montar providers reales, y aísla el
componente de la lógica de AuthContext/router (que ya tienen sus propios
tests en T10/T11).

**Cómo aplicar:** para cualquier pantalla que dependa de `useAuth` +
`useNavigate` (como futuras páginas en `src/routes/`), replicar este patrón de
mock en vez de armar providers reales, salvo que el test necesite verificar
integración real entre componentes.

Ver también [[vitest-shared-config-frontend]].
