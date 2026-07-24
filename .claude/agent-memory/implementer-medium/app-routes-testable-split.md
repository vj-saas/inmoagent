---
name: app-routes-testable-split
description: App.tsx exporta AppRoutes (sin BrowserRouter) para poder testear rutas con MemoryRouter e initialEntries
metadata:
  type: project
---

`frontend/src/App.tsx` (T13) separa el árbol de `<Routes>` en un componente
`AppRoutes` exportado, y el `export default function App()` solo envuelve
`AppRoutes` en `BrowserRouter` + `AuthProvider`. Esto permite testear
navegación real (login público, `/` → redirect a `/leads`,
`/leads/:leadId` → `LeadDetailPage`) con `MemoryRouter initialEntries={[...]}`
sin duplicar el árbol de rutas en el test.

**Por qué:** `BrowserRouter` no soporta `initialEntries`, y duplicar el árbol
de rutas en el test (en vez de importarlo) hace que un cambio real en
`App.tsx` no se detecte en el test.

**Cómo aplicar:** si se agregan más rutas top-level, tocar `AppRoutes`, no el
`App` default export. Los tests de rutas van en `src/App.test.tsx`.

Relacionado: [[leadspage-orchestration-pattern]].
