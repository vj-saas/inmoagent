---
name: static-assets-orden-helmet
description: En main.ts, useStaticAssets debe registrarse después de app.use(helmet) o /uploads/ sale sin CORP/nosniff/CSP; el chequeo de volumen loguea y no aborta el boot
metadata:
  type: project
---

`app.useStaticAssets('/uploads/')` va registrado **después** de
`app.use(helmet(...))` y de `enableCors`, justo antes de `app.listen`.

**Why:** Express aplica middlewares en orden de registro. Si serve-static queda
primero, las respuestas de `/uploads/` (fotos de propiedades, servidas al
frontend que vive en otro origen) salen sin `crossOriginResourcePolicy:
cross-origin`, sin `X-Content-Type-Options: nosniff` y sin la CSP
`default-src 'none'` — que es justo lo que contiene el riesgo de XSS almacenado
si alguien logra subir HTML/SVG a una ruta pública sin guard ni throttle.

**How to apply:** al tocar `src/main.ts`, mantené ese orden. El chequeo de
volumen (`src/common/uploads-mount-check.util.ts`) compara `statSync(dir).dev`
contra `statSync('/').dev` **solo con `NODE_ENV === 'production'`** y loguea
`error` sin lanzar: es heurística de operación y abortar el boot tumbaría el
webhook (regla de <1s). El `mkdir(recursive)` previo sí puede tumbar el boot a
propósito, porque un mount read-only significa que toda subida va a fallar.
