---
name: prisma-migrate-dev-stale-client
description: Tras `prisma migrate dev` hay que correr `prisma generate` a mano — el client queda stale y el build falla con "Property X does not exist"
metadata:
  type: feedback
---

Después de `npx prisma migrate dev --name <x>` en este repo, **correr siempre
`npx prisma generate`** antes de `npm run build`. `migrate dev` aplica el SQL y
dice "Your database is now in sync with your schema", pero el Prisma Client de
`node_modules/@prisma/client` puede quedar en la versión anterior: el build
falla con `TS2339: Property 'sentByPersonId' does not exist on type ...` aunque
el schema y la migración estén perfectos.

**Why:** en T1 de V-B2 (`Message.sentByPersonId`) la migración corrió limpia y
el build igual falló por esto; se pierde tiempo buscando el error en el schema.
Ocurrió con Prisma 7.8.0 y `prisma.config.ts` en el repo.

**How to apply:** secuencia canónica de cualquier tarea de migración con DB
levantada: `prisma validate` → `prisma migrate dev` → **`prisma generate`** →
`npm run build` → `npm run test`. Ver [[prisma-migration-offline]] para el caso
sin DB.

Dos gotchas asociados:
- `npx tsc --noEmit` pelado tira ~decenas de `TS6059 ... is not under rootDir`
  por los `test/*.e2e-spec.ts`: es ruido preexistente de config, NO una
  regresión. El build canónico es `npm run build` (`nest build`).
- Para verificar el tipado del client generado, un script temporal
  `src/__typecheck-*.ts` con `Eq<Message['campo'], string | null>` y
  `Prisma.MessageInclude` funciona bien, pero **borrar también el `.js`/`.d.ts`
  que quedó en `dist/`** y rebuildear (ver [[prisma7-verify-scripts]]).
</content>
</invoke>
