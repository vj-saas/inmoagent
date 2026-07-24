---
name: leadstatefilter-ui-mapping
description: LeadStateFilter mapea 5 categorías UI + "Todas" a los 6 ConversationState reales; test cubre exhaustividad del enum
metadata:
  type: project
---

`frontend/src/components/leads/LeadStateFilter.tsx` exporta `UI_STATE_GROUPS`
(tipo `Record<Exclude<UiCategory,'Todas'>, ConversationState[]>`) según la
tabla aprobada en `specs/A3-bandeja-leads/plan.md`. "Todas" no está en el
record: el componente la maneja como caso especial que llama `onChange(undefined)`.

**Why:** la spec pedía verificar explícitamente que ningún estado real quede
sin categoría y que ninguno inventado se cuele. Un test dedicado
(`Object.values(UI_STATE_GROUPS).flat()` comparado 1:1 contra el array de los
6 valores reales del enum) blinda esto sin tener que enumerar los 6 casos a
mano cada vez que cambie el enum.

**How to apply:** si se agrega un nuevo `ConversationState` al backend
(`prisma/schema.prisma`), el test de exhaustividad en
`LeadStateFilter.test.tsx` va a fallar hasta que se decida a qué categoría UI
mapea (o se agregue una nueva). Ver también [[leadchips-decoupled-props]] por
el patrón de no acoplar componentes de UI al tipo completo hasta que haga falta.
