---
name: photolisteditor-t12-pattern
description: Patrón de PhotoListEditor.tsx (T12, V-D-portal-propiedades) — validación local de archivo antes de subir, gotcha de test con accept
metadata:
  type: project
---

`frontend/src/components/properties/PhotoListEditor.tsx` valida tamaño (<=5MB)
y extensión del archivo por **nombre** (`.jpg/.jpeg/.png/.webp`), no por magic
bytes: eso ya lo hace el backend (`sniffImageType`, [[image-magic-bytes-t4-pattern]])
y sería redundante/imposible de replicar barato en el cliente sin leer el buffer.
La validación local es solo UX — feedback inmediato antes de gastar un
request — la autoridad real sigue siendo `property-photo-storage.service.ts`.

**Why:** la spec T12 pide explícitamente "rechazo local sin ningún request si
falla", medido en el test verificando que `uploadPropertyPhoto` (mock) no se
llama.

**Gotcha de test:** `userEvent.upload()` respeta el atributo `accept` del
`<input type="file">` y NO dispara el evento si el archivo no matchea — por
lo tanto el test de "extensión no soportada" no puede usar `userEvent.upload`
con un archivo `.pdf` contra un input con `accept=".jpg,.jpeg,.png,.webp"`.
Hay que usar `Object.defineProperty(input, 'files', ...)` + `fireEvent.change`
en ese caso puntual (el resto de los tests sí usan `userEvent.upload` normal).

**How to apply:** si otro componente similar necesita validación de archivo
con `accept` restrictivo, replicar este patrón de test para el caso de
rechazo por extensión.
