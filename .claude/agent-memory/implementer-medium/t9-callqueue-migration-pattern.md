---
name: t9-callqueue-migration-pattern
description: Migración de CallQueuePage/CallQueueRow (V-B design system) a AsyncSection + Card/Button
metadata:
  type: project
---

T9 de specs/V-B-design-system/tasks.md: CallQueuePage.tsx pasó de Spinner/ErrorBanner
manuales por ternarios a `AsyncSection` (mismo patrón que AgendaPage/LeadsPage), y
CallQueueRow.tsx (no es tabla, es lista de "cards" expandibles) pasó sus 5 `style={{}}`
inline a `Card`/`CardBody` + `Button` de `components/ui` con clases Tailwind de
`theme.css` (text-text, text-text-muted, etc).

**Why:** no había test `CallQueueRow.test.tsx` propio — toda la cobertura de
testids (`call-queue-row*`) vive en `CallQueuePage.test.tsx`, así que alcanzaba con
correr la suite completa sin crear tests nuevos.

**How to apply:** para próximas migraciones de "fila expandible" (no tabla), usar
`Card`+`CardBody` en vez de forzar `TableScroll`/`Table`. `EmptyState`/`AsyncSection`
ya soportan testid custom vía `emptyTestId` sin romper contratos existentes — el
`emptyTitle` pasado a `AsyncSection` puede ser literalmente el texto legado
("No hay leads pendientes de llamar.") si el test solo verifica el testid, no el texto.
Relacionado: [[leadspage-orchestration-pattern]], [[agendapage-t7-daterangepicker-mount-emit]].
