---
name: t11-applayout-header-toastprovider
description: T11 (V-B-design-system) — migración de AppLayout a header responsive + montaje de ToastProvider en App.tsx
metadata:
  type: project
---

Tarea T11 de `specs/V-B-design-system/tasks.md`: migrar `AppLayout.tsx` a Tailwind
y montar `ToastProvider` en `App.tsx`. Completada 2026-07-25.

Solución para el riesgo de "nav duplicada" (documentado en el plan): UNA sola
lista de `<Link>` dentro de `<nav className="... overflow-x-auto">`, sin
duplicar para mobile/desktop. El scroll horizontal es del contenedor `nav`,
no de la página, así que no viola AC-8. El botón de logout se migró a
`Button` de `ui/` (variant secondary, size sm) preservando el texto exacto
"Cerrar sesión" que usa `getByRole('button', { name: 'Cerrar sesión' })`.

`ToastProvider` ya existía (T2) — solo hubo que envolver `<AppRoutes />` en
`App.tsx`, cambio puramente aditivo, sin tocar rutas.

**Por qué:** el gate de AC-1 busca tanto `style={` como `CSSProperties` (no
alcanza con borrar los `style={{}}` si queda el tipo `CSSProperties` en una
variable como `navLinkStyle` — había que eliminar también esa declaración,
no solo sus usos).

**Cómo aplicar:** al migrar cualquier componente con nav/header en este
proyecto, verificar SIEMPRE que no quede ningún `CSSProperties` residual
aunque los `style={{}}` ya se hayan borrado. Suite completa se mantuvo en
44 archivos / 329 tests tras el cambio (ver [[t9-callqueue-migration-pattern]]
y [[t10-peoplepage-migration-pattern]] para el resto de la migración V-B).
