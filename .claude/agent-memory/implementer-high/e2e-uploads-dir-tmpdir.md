---
name: e2e-uploads-dir-tmpdir
description: Cómo montar un e2e que escribe archivos (UPLOADS_DIR en tmpdir + useStaticAssets en el test app) y qué status devuelve realmente cada rechazo de upload
metadata:
  type: project
---

Para un e2e que ejercita subida/servido de archivos:

- `process.env.UPLOADS_DIR = mkdtempSync(...)` **antes** de los `import` de
  `AppModule` (TS preserva el orden de statements al emitir CommonJS, así que un
  `const` arriba de los imports corre primero). Funciona porque dotenv de
  `@nestjs/config` no pisa variables ya presentes en `process.env`. `rmSync` en
  `afterAll`. No poner `eslint-disable-next-line import/first`: esa regla no está
  instalada y eslint falla con "Definition for rule not found".
- El test app **no pasa por `main.ts`**: hay que replicar
  `createNestApplication<NestExpressApplication>()` + `app.useStaticAssets(dir,
  { prefix: '/uploads/', ... })` a mano, si no el `GET` de la URL pública da 404.

**Status reales observados en `POST .../properties/photos`** (confirmados en el
log de pino de la corrida): PDF renombrado a `.jpg` → **400**; 6 MB → **413**
(multer, ver [[multer-limits-413-vs-400]]); request sin campo `file` → **400**;
sesión de otro tenant en la URL → **403**; API key de otro tenant → **401**.

**Why:** T19 de V-D es la única cobertura punta a punta del aislamiento por
filesystem; si el fixture no aísla el directorio, el e2e ensucia `./uploads` del
repo y las aserciones de "directorio vacío" pasan o fallan por contaminación.

**How to apply:** ver `test/admin-properties-photo-upload.e2e-spec.ts`. Las
aserciones que de verdad matan mutantes (verificado mutando el service, ver
[[mutation-check-critical-branches]]): nombre `^uuid\.jpg$`, `dirname` distinto
por tenant, y que `url_de_A.replace(tenantA, tenantB)` NO sea la URL de B ni
exista en disco.
