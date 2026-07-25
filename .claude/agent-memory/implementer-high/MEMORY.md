# Memory index

- [Suites e2e flaky](e2e-flaky-suites.md) — webhook p95 y conversation-engine fallan por timing/LLM, no son regresión
- [Flake de argon2 en la suite completa](argon2-suite-flake.md) — password.util.spec.ts puede fallar por timeout concurrente; pasa aislado

- [Flake de e2e en paralelo](e2e-parallel-flake.md) — la suite e2e completa puede fallar 1-2 suites por workers sobre DB compartida; re-correr/aislar confirma verde

- [E2E del guard compuesto](composite-guard-e2e.md) — cómo montar fixture PersonOrApiKey y precedencia/roles fijados para leads/metrics/properties
- [Migración Prisma sin DB local](prisma-migration-offline.md) — generar el SQL canónico con `migrate diff --from-schema/--to-schema`; Prisma fusiona ADD COLUMN y ordena alfabéticamente
- [Scripts de verificación con Prisma 7](prisma7-verify-scripts.md) — cómo correr ts-node contra la DB (driver adapter, --transpile-only, script dentro del repo); Session sin tenantId
- [PATCH parcial null-vs-ausente](patch-partial-null-vs-absent.md) — detectar presencia sobre req.body crudo, no sobre el DTO transformado; connect/disconnect para FK nullable
- [Caracteres de control en specs](control-chars-in-specs.md) — usar escapes \uXXXX, no bytes crudos: el .ts queda binario y Edit/Grep dejan de funcionar
- [FK scalar en updateMany](prisma-updatemany-fk-scalar.md) — tipar data como UncheckedUpdateManyInput para setear assignedUserId vía updateMany condicionado a status
