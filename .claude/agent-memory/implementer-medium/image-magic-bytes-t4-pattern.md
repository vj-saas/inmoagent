---
name: image-magic-bytes-t4-pattern
description: sniffImageType (T4, V-D-portal-propiedades) — detección de jpeg/png/webp por buffer, sin dependencias
metadata:
  type: project
---

`src/admin/properties/image-magic-bytes.util.ts` expone `sniffImageType(buffer): 'jpeg'|'png'|'webp'|null`,
función pura sin I/O. Punto clave: webp requiere chequear DOS offsets (`RIFF` en 0
y `WEBP` en 8) porque `RIFF` solo también matchea WAV/AVI — un sniff que solo
mirara `RIFF` daría falsos positivos.

**Por qué:** T5 (`PropertyPhotoStorageService`) depende de esto para rechazar
archivos antes de escribir a disco y para derivar la extensión guardada (nunca
del nombre original del usuario).

**Cómo aplicar:** si en el futuro se agregan más formatos de imagen soportados
(ej. gif, avif), extender esta misma función con su propio magic number en vez
de sumar la dependencia `file-type` (justificación ya documentada: conjunto de
formatos acotado). Ver también `csv-parser.util.ts` como otro ejemplo de "sin
dependencia externa por formato acotado" en el mismo módulo.
