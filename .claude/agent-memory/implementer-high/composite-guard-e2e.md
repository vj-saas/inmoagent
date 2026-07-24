---
name: composite-guard-e2e
description: Cómo montar e2e del PersonOrApiKeyGuard (leads/metrics/properties) y qué precedencia/roles fijar
metadata:
  type: project
---

E2E del guard compuesto `PersonOrApiKeyGuard` vive en `test/admin-guard-composite.e2e-spec.ts` (T6 de specs/A2-frontend-base).

**Cómo montar el fixture:**
- Crear tenant + API key vía `POST /admin/tenants` con `X-Master-Key` (devuelve `{ tenantId, apiKey }`).
- Owner: `POST /admin/tenants/:id/people/bootstrap-owner` (X-Master-Key) con password conocida → login para token.
- Agent: `POST /admin/tenants/:id/people` como owner, pasando `password` explícito (no solo `temporaryPassword`) → login para token conocido.
- Leads se seedean vía prisma (`tenantId` + `phone` único). Propiedades vía `POST .../properties` con X-Api-Key.
- Métricas requieren query `from`/`to` (MetricsQueryDto), si no 400.

**Comportamiento fijado (no cambiar sin re-discutir):**
- AC-17: OWNER y AGENT leen igual leads/metrics/properties. Estos endpoints NO tienen restricción de rol adicional (a diferencia de /people que exige OWNER). El guard solo verifica sesión + TenantScope.
- AC-19: sesión de tenant A contra `:tenantId` de B → 403 (TenantScopeGuard), no 401.
- Precedencia ante ambos headers: X-Api-Key inválido + Bearer válido → 401 (gana API key, NO cae a sesión). Determinista por presencia del header.

**Cobertura de ESCRITURA (agregada 2026-07-23):** el mismo spec cubre POST leads/:id/release, DELETE leads/:id, POST/PATCH/PATCH-status/DELETE properties. Cross-tenant por sesión (A contra URL de B) → 403 antes del handler (TenantScopeGuard) y se verifica con Prisma que los datos de B NO mutan. Contracara positiva con sesión del tenant correcto → 2xx. Gotcha: `Property.price` es `Decimal` de Prisma, comparar con `.toString()` (dos queries devuelven instancias distintas, `toBe` falla por identidad). PropertyStatus válidos: ACTIVE/RESERVED/SOLD_OR_RENTED/PAUSED. Release exige lead en HUMAN_HANDOFF; lo seedeo por prisma con `state` y `handoffAt`.

**Cobertura A.4 T8 (aislamiento de los 6 endpoints nuevos de ficha, 2026-07-24):** la matriz cross-tenant se partió en dos specs por tipo de auth. `test/admin-lead-management.e2e-spec.ts` (auth por X-Api-Key) cubre caso (b) "lead de OTRO tenant vía la URL del tenant propio → 404": mismo `:tenantId` propio en URL + leadId ajeno → `findLeadOrThrow` no matchea → 404 indistinguible de inexistente, más aserción de que el lead ajeno no mutó. `test/admin-guard-composite.e2e-spec.ts` (auth por sesión Bearer, ya tiene fixture tenantA/tenantB) cubre caso (c) "sesión A contra `:tenantId` de B → 403" para los 6 endpoints, con verificación de no-mutación de B por Prisma. Caso (a) 404 inexistente ya venía cubierto por-endpoint en T3-T7; caso (d) assignedUserId de otro tenant → 400 ya estaba en AC-13. No dupliqué (a)/(d).

Ver [[e2e-parallel-flake]]: el warning "worker process failed to exit gracefully" al final de test:e2e es teardown leak, no falla de test.
