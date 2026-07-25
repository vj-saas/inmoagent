---
name: t12-legacy-css-cleanup-gates
description: Cierre de la migración Tailwind — al borrar legacy.css aparecen valores px arbitrarios sueltos que rompen el gate de AC-3
metadata:
  type: feedback
---

Al cerrar `specs/V-B-design-system` (T12), el grep de `style={`/`CSSProperties`
ya daba cero en las 8 rutas migradas (T4-T11 lo dejaron limpio), pero el gate
de AC-3 (cero hex/rgb/tamaños o radios literales fuera de `theme.css`)
encontró 4 arbitrary values de Tailwind con `px` sueltos que ninguna tarea
previa había tocado: `LoginPage` (`max-w-[380px]` → `max-w-sm`),
`MessageTimeline` (`min-h-[200px]` → `min-h-52`, `text-[11px]` → `text-xs`) y
`Spinner` (`border-[3px]` → `border-2`).

**Por qué:** el patrón `style={{...}}`/`CSSProperties` es fácil de gatear,
pero un arbitrary value de Tailwind (`className="...-[Npx]"`) es tan literal
como un inline style y viola igual AC-3 (paleta/tipografía/espaciado/radios
"fuera de theme.css"), y no lo detecta el grep de `style={`.

**Cómo aplicar:** en la tarea de cierre de una migración de design system,
correr también `grep -rEn "\[[0-9]+(px|rem)\]" src/routes/ src/components/`
(no solo `style={`/`CSSProperties`) y reemplazar por la utilidad de escala de
Tailwind más cercana (no hace falta agregar un token nuevo a `theme.css` si ya
existe una utilidad estándar equivalente — `text-xs`, `max-w-sm`, `border-2`,
etc. no son "literales fuera del archivo de tokens", son parte de la escala
de Tailwind ya declarada implícitamente por el framework).

Ver también [[t11-applayout-header-toastprovider]] (mismo patrón de gate con
falso negativo si solo se busca la ocurrencia obvia).
