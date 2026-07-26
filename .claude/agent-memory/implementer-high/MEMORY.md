# Memory index

- [Suites e2e flaky](e2e-flaky-suites.md) — webhook p95 y conversation-engine fallan por timing/LLM, no son regresión
- [Flake de argon2 en la suite completa](argon2-suite-flake.md) — password.util.spec.ts puede fallar por timeout concurrente; pasa aislado

- [Flake de e2e en paralelo](e2e-parallel-flake.md) — la suite e2e completa puede fallar 1-2 suites por workers sobre DB compartida; re-correr/aislar confirma verde

- [E2E del guard compuesto](composite-guard-e2e.md) — cómo montar fixture PersonOrApiKey y precedencia/roles fijados para leads/metrics/properties
- [Client stale tras migrate dev](prisma-migrate-dev-stale-client.md) — correr `prisma generate` a mano o el build falla con "Property X does not exist"
- [Migración Prisma sin DB local](prisma-migration-offline.md) — generar el SQL canónico con `migrate diff --from-schema/--to-schema`; Prisma fusiona ADD COLUMN y ordena alfabéticamente
- [Scripts de verificación con Prisma 7](prisma7-verify-scripts.md) — cómo correr ts-node contra la DB (driver adapter, --transpile-only, script dentro del repo); Session sin tenantId
- [PATCH parcial null-vs-ausente](patch-partial-null-vs-absent.md) — detectar presencia sobre req.body crudo, no sobre el DTO transformado; connect/disconnect para FK nullable
- [Caracteres de control en specs](control-chars-in-specs.md) — usar escapes \uXXXX, no bytes crudos: el .ts queda binario y Edit/Grep dejan de funcionar
- [WebhookEvent no cascadea](webhookevent-no-fk-cleanup.md) — tenantId sin FK: limpiarlo a mano en afterAll y usar waMessageId con suffix
- [DB local desactualizada en e2e](e2e-local-db-migrate-deploy.md) — "column does not exist" = falta `prisma migrate deploy`; cómo levantar Docker Desktop
- [E2E del wizard de onboarding](onboarding-wizard-e2e.md) — cadena de 7 pasos HTTP; rawBody en el test app y por qué webhook-status no necesita esperar la cola
- [Fixtures tipados con Pick en specs](pick-fixture-excess-property.md) — probar que un campo NO influye requiere factory tipada, no literal inline (excess property check)
- [Mutar la rama para validar el test](mutation-check-critical-branches.md) — en messaging/pipeline, forzar if(false)/if(true) y confirmar que el test nuevo falla antes de cerrar
- [Lock de lead sin fencing](debounce-lock-ttl-no-fencing.md) — TTL 60s + DEL plano: no meter trabajo largo dentro de withLeadLock/tryFlush
- [FK scalar en updateMany](prisma-updatemany-fk-scalar.md) — tipar data como UncheckedUpdateManyInput para setear assignedUserId vía updateMany condicionado a status
