---
name: t18-integration-verification-pattern
description: Tareas de "integración final + verificación" (español/AC de no-selector-de-estado) suelen encontrar el ensamblado ya hecho; el valor está en cubrir el hueco de integración componente-aislado vs efecto-visible-en-orquestador
metadata:
  type: feedback
---

En A.4 T18 se pidió "ensamblar" LeadDetailPage con los 7 subcomponentes y
verificar AC-23 (español) y AC-24 (sin selector genérico de ConversationState).
El ensamblado ya estaba hecho por T11 (el orquestador ya integraba todo). Al
inspeccionar código no hubo texto en inglés ni selects de estado que corregir.

**Por qué:** cuando las tareas anteriores (T11-T17) ya declaran explícitamente
haber compuesto el árbol final, la tarea de "cierre" es más una auditoría que
una implementación. No asumir que hay trabajo de ensamblado pendiente sin
antes leer el archivo actual.

**Cómo aplicar:** en tareas de cierre/integración, el hueco real de cobertura
suele estar en que cada componente tiene tests aislados (props mockeadas) pero
ninguno prueba end-to-end dentro del orquestador que una acción de escritura
(crear nota, togglear contactado, liberar handoff) efectivamente actualiza lo
que se ve en pantalla sin recargar. Agregar esos tests de integración en el
test file del orquestador (ej. `LeadDetailPage.test.tsx`) usando
`@testing-library/user-event` en vez de duplicar la cobertura unitaria ya
existente por componente. Ver [[leaddetailpage-orchestrator-t11]] y
[[leadspage-mutual-exclusion-gap]] para el patrón equivalente en LeadsPage.
