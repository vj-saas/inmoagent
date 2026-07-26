---
name: t16-propertiespage-inline-action-panels
description: PropertiesPage (T16) monta PropertyStatusControl/DeletePropertyButton como paneles inline seleccionables, no anidados en un Modal propio
metadata:
  type: project
---

`PropertiesList` (T11) es puramente presentacional: sus botones "Cambiar
estado"/"Borrar" solo emiten `onChangeStatus(property)`/`onDelete(property)`,
sin abrir nada. `PropertyStatusControl` (T14) no tiene modal propio (es un
Select+Button inline), pero `DeletePropertyButton` (T15) SÍ trae su propio
botón "Eliminar" + Modal de confirmación + `ErrorBanner` interno.

Decisión tomada en T16 (`frontend/src/routes/PropertiesPage.tsx`): al recibir
`onChangeStatus`/`onDelete` desde `PropertiesList`, el orquestador NO abre un
`Modal` propio envolviendo estos componentes (evita modal-dentro-de-modal con
`DeletePropertyButton`). En cambio, selecciona la propiedad en estado local y
renderiza el componente dedicado inline en un `Card` debajo de la tabla, con
un botón "Cerrar" para deseleccionar. El flujo de borrado queda en dos pasos
visibles (click "Borrar" en la fila → aparece el panel con el botón "Eliminar"
de `DeletePropertyButton` → confirmar en su modal), pero evita duplicar UI de
confirmación.

**Por qué:** `DeletePropertyButton` ya expone su propio `ErrorBanner` para el
409 de borrado (AC-10); envolverlo en un segundo `Modal` en el padre hubiera
significado modales apilados sin beneficio.

**Cómo aplicar:** si una tarea futura toca `PropertiesPage` o refactoriza esta
integración, no asumir que "por fila" implica modal per-fila — verificar si el
componente dedicado (T14/T15) ya trae su propio modal antes de envolverlo en
otro. Ver también [[leaddetailpage-t18-final-wiring]] por un patrón similar de
wiring final entre componentes ya construidos.
