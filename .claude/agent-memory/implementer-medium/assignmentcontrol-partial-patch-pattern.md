---
name: assignmentcontrol-partial-patch-pattern
description: AssignmentControl (T15) usa flags "touched" por campo para armar PATCH parcial de assignedUserId/nextActionAt
metadata:
  type: project
---

`AssignmentControl.tsx` (frontend/src/components/leads/) resuelve la semántica
parcial del PATCH de asignación con dos flags de estado (`assignedTouched`,
`nextActionTouched`) que se activan en el `onChange` de cada input, no
comparando valores. Así "no tocar el campo" siempre omite la key del DTO,
incluso si el usuario selecciona y luego revierte al mismo valor (edge case
que un diff de valores no cubriría igual de simple).

Sentinela `UNASSIGNED_VALUE = '__unassigned__'` en el `<select>` para poder
distinguir "no tocado" (value inicial = assignedUserId real o sentinela) de
"elegido explícitamente sin asignar" (envía `assignedUserId: null`).

Resolución de email del asignado: `assignableUsers.find(u => u.id === lead.assignedUserId)`,
fallback al id crudo si no está (persona desactivada) — mismo patrón que
[[leadstatefilter-ui-mapping]] de mapeo defensivo contra listas incompletas.

**Why:** la tarea exigía explícitamente no mandar campos no tocados en el
body del PATCH (AC-12/13/14), y un enfoque ingenuo de "value !== initial"
falla si el usuario terminó en el mismo valor tras tocar el control.

**How to apply:** si otra pantalla necesita PATCH parcial con selects/inputs
opcionales, replicar el patrón de flags "touched" en vez de diffear valores.
