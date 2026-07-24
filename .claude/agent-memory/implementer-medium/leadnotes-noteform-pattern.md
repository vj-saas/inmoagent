---
name: leadnotes-noteform-pattern
description: LeadNotes/NoteForm (T13) — patrón de lista controlada + callback onCreated sin refetch
metadata:
  type: project
---

`LeadNotes.tsx` es puramente presentacional (recibe `notes: LeadNote[]` y renderiza en el orden dado, sin ordenar). `NoteForm.tsx` valida `body.trim().length === 0` para deshabilitar el submit y mostrar error en español, sin invocar `createNote` en ese caso; al éxito llama `onCreated(note)` para que el padre (`LeadDetailPage`, T11/T18) la inserte al tope de su estado en memoria — el form nunca mantiene su propia copia de la lista.

**Por qué:** la spec (AC-7) exige "sin refetch ni recarga de página"; separar el estado de la lista del formulario evita que el form necesite conocer el resto de las notas.

**Cómo aplicar:** al integrar en `LeadDetailPage` (T11/T18), el setter de notas debe hacer `setNotes(prev => [note, ...prev])`, no reemplazar el array. Ver también [[endpoints-t10-lead-note-assignable]] para la firma de `createNote(tenantId, leadId, body, token)`.
