---
name: prisma7-verify-scripts
description: Cómo correr scripts ad-hoc de verificación contra la DB con Prisma 7 (driver adapter) sin pelearse con tipos ni module resolution
metadata:
  type: feedback
---

Para verificar comportamiento de DB (ej. cascades de FK) con un script suelto de
ts-node en este repo (Prisma 7 + `@prisma/adapter-pg` + `prisma.config.ts`):

- El `PrismaClient` se instancia con `new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })` — NO hay `url` en el bloque `datasource` de `schema.prisma`; el connection string va por el adapter y la CLI lo lee de `.env` (`DATABASE_URL` → Postgres local en `localhost:5434`).
- Correr `npx prisma generate` antes (migrate dev ya lo hace, pero conviene asegurarlo).
- Usar `npx ts-node --transpile-only`: el type-check estricto contra el cliente generado tira falsos `TS2339 Property 'person' does not exist` aunque el runtime funcione.
- El script DEBE vivir dentro del árbol del proyecto (copiar a la raíz y borrarlo al final); desde el scratchpad externo falla la resolución de `node_modules` (`argon2`, `@prisma/client`).

**Why:** en T1 de A1-auth-personas verifiqué el cascade `Tenant → Person → Session` con un script así y perdí dos intentos por estos tres detalles.
**How to apply:** cualquier tarea high que necesite confirmar comportamiento real de la DB (cascades, constraints, transacciones) fuera de los tests e2e.

Nota de arquitectura relevante: `Session` NO lleva `tenantId` denormalizado (decisión aprobada en `specs/A1-auth-personas/plan.md` #1); el `tenantId` se resuelve siempre vía `person.tenant`. No agregarlo "para simplificar una query".
