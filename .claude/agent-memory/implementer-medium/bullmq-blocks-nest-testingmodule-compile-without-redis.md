---
name: bullmq-blocks-nest-testingmodule-compile-without-redis
description: Test.createTestingModule({imports:[AdminModule]}).compile() se cuelga sin timeout si BullMQ/Redis no está disponible (docker no corriendo)
metadata:
  type: project
---

Al intentar verificar resolución de DI de `AdminModule` (que importa `PipelineModule`,
que registra colas BullMQ) con `Test.createTestingModule(...).compile()` sin Redis
real corriendo, el proceso se cuelga indefinidamente (no tira error, no hace timeout
del test — jest-e2e.json tiene testTimeout 30s pero el hang ocurre antes, en
`.compile()`, aparentemente por reintentos de conexión de ioredis).

**Por qué:** BullMQ intenta conectar a Redis apenas se registra la queue, incluso
sin llamar a `app.init()`. `PrismaService` en cambio no conecta hasta `onModuleInit`
así que solo Prisma no bloquea, pero el pipeline con colas sí.

**Cómo aplicar:** Para verificar DI de módulos que dependen de `PipelineModule`
(o cualquier módulo con BullMQ) sin infra real, NO alcanza con un
`Test.createTestingModule` desnudo. O se levanta `docker compose up -d` (Postgres+Redis)
antes, o se confía en `npm run build` (tsc/nest build resuelve tipos e imports, aunque
no valida el grafo de DI en runtime) + los unit tests existentes con mocks. Documentar
esta limitación en el reporte en vez de perder tiempo esperando el hang.
