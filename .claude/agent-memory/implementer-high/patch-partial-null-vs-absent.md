---
name: patch-partial-null-vs-absent
description: Cómo distinguir "campo ausente" de "campo enviado como null" en PATCH parciales de NestJS
metadata:
  type: project
---

En endpoints PATCH con semántica parcial (ej. `PATCH leads/:id/assignment`, A.4 T6),
hay que distinguir "campo no enviado" (no tocar) de "campo enviado como `null`"
(limpiar). El `ValidationPipe` global está en `app.module.ts` con
`{ whitelist: true, transform: true }` (sin `forbidNonWhitelisted`).

**Solución que funciona:** el pipe transforma el DTO param pero NO muta `req.body`.
Se inyecta `@Body() dto: XDto` (solo para validar formato) Y `@Req() req` para leer
el body CRUDO. La presencia se detecta con `'campo' in rawBody` sobre `req.body`.
El service recibe `rawBody: Record<string, unknown>` y arma el `data` de Prisma solo
con los campos presentes.

**DTO:** cada campo `@IsOptional()` + `@ValidateIf(o => o.campo !== null)` antes del
validador de formato (`@IsString`/`@IsDateString`), para tolerar `null` explícito.

**Prisma relación FK nullable:** para setear/limpiar `assignedUserId` (relación
`assignedUser`) usar `{ connect: { id } }` / `{ disconnect: true }`, no asignar el
escalar directo cuando la relación está definida en el modelo.

Gotcha aparte: si tocás `schema.prisma` (columnas nuevas de Lead: `contactedAt`,
`assignedUserId`, `nextActionAt`), correr `npx prisma generate` ANTES de los tests o
el client viejo tira "Unknown argument". Ver [[prisma7-verify-scripts]].
