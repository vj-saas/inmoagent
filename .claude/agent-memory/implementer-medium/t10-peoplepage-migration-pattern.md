---
name: t10-peoplepage-migration-pattern
description: PeoplePage migrada a design system (T10 de V-B-design-system) — patrón de early-return de error + skeleton de tabla ad-hoc + Modal con testid pasado como prop
metadata:
  type: project
---

Al migrar `frontend/src/routes/PeoplePage.tsx` (T10 de `specs/V-B-design-system/tasks.md`):

- El early-return de error (`ForbiddenError` y error genérico, devolviendo solo
  `<ErrorBanner />` antes de renderizar el resto de la página) se preservó tal
  cual de la versión legacy, en vez de forzarlo por `AsyncSection`. `AsyncSection`
  solo se usó para el tramo loading/empty/tabla, ya con el error descartado
  arriba. Ningún test lo exigía explícitamente pero es el comportamiento previo
  y no había motivo para cambiarlo.
- `ui/Modal` (`frontend/src/components/ui/Modal.tsx`) resuelve `role="dialog"`
  y `aria-label` automáticamente a partir de la prop `title` (si es string), y
  cualquier prop extra como `data-testid` se spreadea sobre el div del diálogo
  (no el overlay). Por eso alcanza con pasar `title="Contraseña temporal"` +
  `data-testid="temporary-password-modal"` para preservar exactamente el
  contrato que buscaban los tests viejos, sin tener que tocar el componente.
- No existía un "Skeleton de tabla" reusable en `ui/` — se armó inline en la
  página (`PeopleTableSkeleton`, 3 filas de `Skeleton variant="text"` dentro de
  `Table`/`THead`/`TBody`) pasado como prop `skeleton` a `AsyncSection`. Si una
  futura tarea necesita este patrón en otra página, considerar extraerlo a
  `ui/` en vez de duplicarlo.
- Empty state nuevo (`people-empty`, sin test previo que lo cubriera) se
  resolvió con `isEmpty={!loading && people.length === 0}` en `AsyncSection`,
  igual patrón que `[[t9-callqueue-migration-pattern]]` y `AgendaPage`/`LeadsPage`.

**Por qué:** T8/T9/T10 comparten el mismo hueco (empty state que no existía
antes) y la misma solución vía `AsyncSection`; documentar el patrón de Modal +
skeleton ad-hoc ahorra tiempo de exploración en la próxima tarea que toque
`ui/Modal` o necesite un skeleton de tabla.

**Cómo aplicar:** antes de crear un nuevo Skeleton de tabla, revisar si ya se
extrajo a `ui/` desde esta tarea. Antes de usar `ui/Modal` con testid legacy,
recordar que `title` + prop extra ya cubren `role`/`aria-label`/`data-testid`
sin código adicional.
