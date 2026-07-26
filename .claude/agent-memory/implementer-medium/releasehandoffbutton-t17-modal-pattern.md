---
name: releasehandoffbutton-t17-modal-pattern
description: T17 (B2-bandeja-manual) extendió ReleaseHandoffButton con Modal de confirmación calcado de SuppressLeadButton
metadata:
  type: project
---

Al agregar un `Modal` de confirmación a un botón de acción existente (T17,
`ReleaseHandoffButton.tsx`), el patrón ya establecido en
`SuppressLeadButton.tsx` es el modelo a copiar: estado local (`confirming`/
`confirmOpen`), botón principal solo abre el modal (`handleOpenModal`), la
mutación (`run` de `useApi`) se invoca únicamente desde `handleConfirm`
dentro del modal, `handleCancel` cierra sin efecto. `data-testid`s con
prefijo del componente + sufijo `-modal`/`-cancel`/`-confirm`.

**Why:** mantiene consistencia visual y de testing en toda la carpeta
`components/leads/`; evita reinventar el flujo de confirmación en cada
botón de acción destructiva/sensible.

**How to apply:** al tocar otro botón de acción (ej. opt-out, suppress,
handoff) que necesite confirmación, buscar primero `SuppressLeadButton.tsx`
como referencia antes de diseñar el modal desde cero.

Nota importante: extender un componente usado en una página orquestadora
(acá `LeadDetailPage.tsx`) rompe los tests de integración de esa página si
el test asumía el comportamiento viejo (click directo = mutación). Grep por
el `data-testid` del botón en toda la suite (`grep -rn "release-handoff" src`)
antes de dar la tarea por terminada, no solo correr el test del componente
aislado — ver también [[t18-integration-verification-pattern]].
