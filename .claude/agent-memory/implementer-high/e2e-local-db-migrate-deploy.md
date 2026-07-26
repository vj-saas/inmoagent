---
name: e2e-local-db-migrate-deploy
description: Antes de correr e2e, aplicar `npx prisma migrate deploy` — la DB de docker-compose queda atrás cuando otro agente agregó una migración
metadata:
  type: project
---

Si un e2e falla con `The column Tenant.X does not exist in the current
database`, no es un bug del test ni del código: la Postgres local de
`docker-compose` no tiene aplicada la última migración.

**Why:** los `implementer` que agregan migraciones (p. ej. T1 de V-C, que sumó
`welcomeIntro`/`handoffIntro`) commitean el SQL pero no necesariamente lo
aplican a la DB local del entorno donde después corren los e2e — a veces ni
siquiera tienen Docker levantado (ver [[prisma-migration-offline]]).

**How to apply:** secuencia de arranque antes de cualquier `test:e2e`:
`docker compose up -d` (si el engine de Docker Desktop no responde, lanzar
`"/c/Program Files/Docker/Docker/Docker Desktop.exe"` y reintentar a los ~30 s)
→ `npx prisma migrate deploy` → correr la suite. Nunca `migrate dev` ni
`db push` para esto: solo aplica lo ya commiteado, sin generar migraciones
nuevas.

Ojo también con el ThrottlerGuard global (120 req/min): un spec e2e con muchos
logins/PATCH en serie se acerca al límite; los headers `x-ratelimit-remaining`
aparecen en los logs de pino y sirven para diagnosticar un 429 inesperado.
