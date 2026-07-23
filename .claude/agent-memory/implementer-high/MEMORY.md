# Memory index

- [Suites e2e flaky](e2e-flaky-suites.md) — webhook p95 y conversation-engine fallan por timing/LLM, no son regresión
- [Flake de argon2 en la suite completa](argon2-suite-flake.md) — password.util.spec.ts puede fallar por timeout concurrente; pasa aislado

- [Flake de e2e en paralelo](e2e-parallel-flake.md) — la suite e2e completa puede fallar 1-2 suites por workers sobre DB compartida; re-correr/aislar confirma verde

- [E2E del guard compuesto](composite-guard-e2e.md) — cómo montar fixture PersonOrApiKey y precedencia/roles fijados para leads/metrics/properties
- [Scripts de verificación con Prisma 7](prisma7-verify-scripts.md) — cómo correr ts-node contra la DB (driver adapter, --transpile-only, script dentro del repo); Session sin tenantId
