---
name: httpclient-formdata-support
description: request() en http-client.ts soporta FormData sin romper el mapeo de errores tipados ni la serialización JSON existente
metadata:
  type: project
---

`frontend/src/api/http-client.ts` `request()` ahora detecta `body instanceof FormData`:
si es FormData, no hace `JSON.stringify` ni setea `Content-Type` (el navegador pone
el `boundary` solo al pasar un `FormData` crudo a `fetch`). Si no, mantiene el
comportamiento original (JSON.stringify + `Content-Type: application/json`). El
mapeo de errores tipados (NetworkError/ValidationError/onUnauthorized) no cambió,
está fuera del branch de serialización.

**Por qué:** era prerrequisito de T10 (specs/V-C-onboarding-tenant) para que el
uploader de CSV del wizard de onboarding (tarea futura, otro implementer) pueda
mandar `multipart/form-data`.

**Cómo aplicar:** si una tarea futura necesita mandar archivos vía `request()`,
ya funciona pasando `body: formData` — no hace falta tocar el cliente de nuevo.
Al testear, usar `mockFetchOnce` existente en `http-client.test.ts` y verificar
`init.headers['Content-Type']` undefined + `init.body === formData` (no
serializado). Ver también [[vitest-shared-config-frontend]] para correr toda la
suite (~45 archivos, ~340 tests, tarda ~3-4 min) antes de confirmar sin regresión.
