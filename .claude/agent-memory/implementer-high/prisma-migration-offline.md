---
name: prisma-migration-offline
description: Cómo generar el SQL exacto de una migración Prisma sin DB local (docker no arranca) usando `migrate diff --from-schema/--to-schema`
metadata:
  type: feedback
---

Cuando hay que crear una migración Prisma y no hay Postgres levantado (Docker
Desktop en esta máquina suele estar con `com.docker.service` en `Stopped` y
`Start-Process` de "Docker Desktop.exe" no levanta el daemon; `DATABASE_URL`
apunta a `localhost:5434` → `ECONNREFUSED`), NO escribas el `migration.sql` a
mano de memoria. Generalo offline:

```bash
git show HEAD:prisma/schema.prisma > <scratchpad>/old-schema.prisma
npx prisma migrate diff --from-schema <scratchpad>/old-schema.prisma \
  --to-schema prisma/schema.prisma --script
```

Luego pegá esa salida tal cual en
`prisma/migrations/<YYYYMMDDHHMMSS>_<nombre>/migration.sql` y corré
`npx prisma generate`.

Detalles que cuestan intentos:
- En Prisma 7 las flags `--from-schema-datamodel`/`--to-schema-datamodel`
  **fueron removidas**: son `--from-schema`/`--to-schema`.
- Prisma **fusiona varios `ADD COLUMN` en un solo `ALTER TABLE`** (`ADD COLUMN
  "a" TEXT,\nADD COLUMN "b" TEXT;`) y **ordena las columnas alfabéticamente**,
  no en el orden del schema. Si un plan dice "deben ser N sentencias", contá
  operaciones, no `;`.
- Para verificar el tipado del client generado sin depender de la DB: script
  temporal con `type Eq<A,B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false`
  sobre `Tenant['campo']` y `npx tsc --noEmit`. El script debe vivir dentro del
  árbol del proyecto (ver [[prisma7-verify-scripts]]).

**Why:** en T1 de V-C-onboarding-tenant no había DB; el SQL a mano habría
diferido del canónico de Prisma y `migrate dev` posterior podría marcar drift.
**How to apply:** cualquier tarea de migración de schema sin DB disponible.
Siempre dejá explícito en el reporte que la migración NO se aplicó contra una DB
real y que falta correr `migrate dev`/`deploy` antes de mergear.
