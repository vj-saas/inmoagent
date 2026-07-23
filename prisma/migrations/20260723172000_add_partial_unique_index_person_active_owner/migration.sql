-- Agrega un índice único parcial para garantizar que cada tenant tenga
-- como máximo UN OWNER activo en todo momento. Este constraint es la forma
-- correcta de proteger la invariante «un solo owner activo por tenant»:
--
--   * En un INSERT concurrente de dos bootstrap para el mismo tenant, la base
--     de datos rechaza uno con SQLSTATE 23505 (Prisma P2002) de forma atómica
--     y sin necesidad de nivel de aislamiento Serializable.
--
--   * El índice es PARCIAL (WHERE "role" = 'OWNER' AND "active" = true), por
--     lo que no afecta a AGENTs ni a OWNERs desactivados: si un owner se
--     desactiva, otro puede ser creado libremente después.

CREATE UNIQUE INDEX "Person_one_active_owner_per_tenant"
ON "Person" ("tenantId")
WHERE "role" = 'OWNER' AND "active" = true;
