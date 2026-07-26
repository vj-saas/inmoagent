---
name: person-session-required-guard-t4
description: PersonSessionRequiredGuard (T4, V-B2) — guard marcador método, dónde vive AuthenticatedPersonRequest y precedencia real de PersonOrApiKeyGuard
metadata:
  type: project
---

`PersonSessionRequiredGuard` en `src/admin/guards/person-session-required.guard.ts`
es un guard marcador SIN dependencias que solo chequea `request.person` (adjuntada
por `PersonOrApiKeyGuard` cuando la rama es Bearer). Si falta, 403
(`ForbiddenException`), nunca 401.

**Gotcha de import:** `AuthenticatedPersonRequest` vive en
`src/auth/authenticated-person-request.ts`, NO en
`src/auth/guards/person-session.guard.ts` (ese archivo solo tiene la clase
`PersonSessionGuard`). Grepear el nombre del tipo antes de asumir la ruta.

**Precedencia confirmada de `PersonOrApiKeyGuard`** (`src/admin/guards/person-or-api-key.guard.ts`):
si vienen `X-Api-Key` y `Authorization: Bearer` a la vez, gana `X-Api-Key`
(chequea `hasApiKey` primero) y nunca corre `PersonSessionGuard`, por lo tanto
`request.person` queda sin setear. Esto ya estaba testeado en
`person-or-api-key.guard.spec.ts` ("con X-Api-Key y Bearer a la vez, evalúa
primero X-Api-Key") — para guards que dependen de esa precedencia, replicar el
mismo caso de test en vez de inventar el comportamiento.

**Por qué:** evita re-autenticar (segunda query a Session) y da 403 en vez del
401 que tiraría `PersonSessionGuard` si se encadenara directo — la spec V-B2
(AC-5) exige distinguir "no autenticado" de "autenticado pero no como persona".

**Cómo aplicar:** para cualquier endpoint admin que necesite "solo sesión de
persona, no API key" sin tocar el guard compuesto compartido por leads/metrics/
properties/appointments, replicar este patrón de guard marcador a nivel método
en vez de tocar `PersonOrApiKeyGuard`.
