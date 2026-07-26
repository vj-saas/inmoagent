---
name: photolisteditor-nested-form-bugfix
description: Bug crítico de form anidado en PhotoListEditor causaba guardado completo al agregar foto por URL; fix y patrón de test de regresión
metadata:
  type: feedback
---

`PhotoListEditor` (dentro de `PropertyForm`, que ya es un `<form>`) tenía su
propio `<form onSubmit={handleAddUrl}>` para el control "Agregar por URL".
El evento `submit` nativo burbujea aunque `handleAddUrl` llame
`preventDefault()` (no llamaba `stopPropagation()`), así que el submit externo
de `PropertyForm.handleSubmit` también se disparaba: agregar una URL con
campos obligatorios ya completos guardaba la propiedad sin que el usuario lo
pidiera.

**Fix aplicado:** eliminar el `<form>` interno, reemplazar por `<div>` +
`<button type="button" onClick={handleAddUrl}>`, y capturar Enter con
`onKeyDown` en el input para no perder la UX de "escribir y apretar Enter".
NO usar `event.stopPropagation()` como solución — es frágil, depende de que
nadie vuelva a envolver el componente en otro form en el futuro. La solución
correcta es que el control deje de ser un `<form>`.

**Why:** confirmado por `code-reviewer`; el warning de React
`validateDOMNesting(...): <form> cannot appear as a descendant of <form>` en
los tests ya avisaba del problema pero no había test que verificara la
consecuencia real (submit no deseado).

**How to apply:** al revisar/crear cualquier componente hijo que se vaya a
usar dentro de un `<form>` de otro componente (ver [[photolisteditor-t12-pattern]],
[[propertyform-t13-field-error-mapping]]), nunca anidar un segundo `<form>`
para un sub-control de "agregar/enviar" — usar botón `type="button"` +
`onKeyDown` para Enter. Test de regresión: montar el componente hijo DENTRO
de un `<form>` real con `onSubmit` mockeado y verificar que ese mock no se
llama tras la acción del sub-control.
