---
name: admin-people-assignable-guards
description: Patrón de guard por-handler para endpoints "solo panel humano" con ambos roles (OWNER+AGENT), sin OwnerRoleGuard ni PersonOrApiKeyGuard
metadata:
  type: project
---

En `AdminPeopleController`, cada handler ya declara su propia cadena de
`@UseGuards` (no hay guard a nivel de clase), lo que permite variar la
cadena por endpoint según su audiencia. Para `GET :tenantId/people/assignable`
(T9 de specs/A4-ficha-lead) se usó `PersonSessionGuard + TenantScopeGuard`
SIN `OwnerRoleGuard` (ambos roles pueden verlo) y SIN `PersonOrApiKeyGuard`
(no hay caso server-to-server, es solo para el panel humano).

Why: la spec distingue explícitamente "solo panel humano" de "también API key"
— agregar `PersonOrApiKeyGuard` de más abriría una superficie no pedida.

How to apply: al agregar un endpoint nuevo a un controller con guards
por-handler, revisar primero qué guards tiene el resto y replicar
selectivamente solo los que la spec pide, no copiar la cadena completa de
otro handler "por las dudas".
