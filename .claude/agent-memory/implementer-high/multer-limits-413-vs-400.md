---
name: multer-limits-413-vs-400
description: FileInterceptor con limits.fileSize devuelve 413 (no 400) porque el error de multer nunca llega al handler; la validación de tamaño en el service es solo defensa en profundidad
metadata:
  type: project
---

`FileInterceptor('file', { limits: { fileSize: N } })` de `@nestjs/platform-express`
aborta el request **dentro del interceptor**: multer emite `MulterError
LIMIT_FILE_SIZE` y Nest lo traduce a `PayloadTooLargeException` (**413**). El
handler del controller nunca corre, así que un chequeo de tamaño en el service
(`file.size > MAX`) nunca ve ese caso por HTTP: solo cubre llamadas internas y
sirve como defensa en profundidad.

**Why:** en T5 de V-D el AC-18 pide 400 para archivos >5MB, pero la tarea también
prescribe `limits` en el interceptor. Con ambas cosas, un archivo de 5MB+1 sale
413, no 400. Se implementó según la tarea y se dejó anotado para el review / el
E2E de T19.

**How to apply:** si un AC exige un status concreto para "archivo demasiado
grande", no alcanza con validar en el service. Hace falta un exception filter (o
`ExceptionFilter` sobre `MulterError`) que remapee 413 → 400, o aceptar 413 en el
test E2E. Decidilo antes de escribir el E2E de subida.
