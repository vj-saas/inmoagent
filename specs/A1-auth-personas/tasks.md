# Tasks A1: Autenticación de personas y roles

> Producido por `task-splitter` a partir de `plan.md` (arquitectura aprobada) y
> `spec.md` (AC-1 a AC-23). Los 3 archivos de aceptance-test-writer
> (`test/auth-login.e2e-spec.ts`, `test/auth-people-management.e2e-spec.ts`,
> `test/auth-isolation.e2e-spec.ts`, 25 tests en total) ya existen y están en
> rojo por 404. Ninguna tarea reemplaza esos tests ni los toca.

## Tareas

## T1 — Migración Prisma: `PersonRole`, `Person`, `Session`
- **Dificultad:** high
- **Descripción:** Modificar `prisma/schema.prisma`: agregar `enum PersonRole { OWNER AGENT }`;
  `model Person` (`id`, `tenantId` + relación `Tenant` con `onDelete: Cascade`,
  `email @unique` global, `passwordHash`, `role`, `active @default(true)`,
  `sessions Session[]`, timestamps, `@@index([tenantId])`,
  `@@index([tenantId, role, active])`); `model Session` (`id`,
  `tokenHash @unique`, `personId` + relación `Person` con `onDelete: Cascade`,
  `expiresAt`, `createdAt`, `@@index([personId])`, `@@index([expiresAt])`, SIN
  `tenantId` denormalizado); agregar la relación inversa `people Person[]` en
  `model Tenant`. Correr `npx prisma migrate dev --name add_person_and_session`
  y confirmar que el cascade `Tenant → Person → Session` no rompe el
  `tenant.deleteMany` de los `afterAll` de los tres specs e2e.
- **Valida:** Ninguna directamente — es una tarea puramente estructural, sin
  test propio. Es prerrequisito de TODOS los AC-1 a AC-23 (nada compila ni
  levanta sin estos modelos). Hueco intencional documentado: la corrección del
  schema en sí se confirma recién en T14 al correr la suite completa.
- **Dependencias:** ninguna
- **Paralelizable:** no (bloquea prácticamente todo lo demás; conviene
  ejecutarla y cerrarla primero aunque no tenga hermanas de grupo)

## T2 — Env vars de sesión y rate-limit
- **Dificultad:** low
- **Descripción:** Agregar a `src/config/env.schema.ts`: `SESSION_TTL_HOURS`
  (coerce number, default 12), `LOGIN_MAX_FAILED_ATTEMPTS` (default 10),
  `LOGIN_WINDOW_MINUTES` (default 15). Actualizar `.env.example` con las tres
  variables y un comentario breve de para qué son.
- **Valida:** Ninguna directamente. Prerrequisito de T4 (rate limiter) y T9
  (duración de sesión, AC-12/AC-22). Sin test propio; su corrección se observa
  indirectamente cuando AC-11 pasa en T14.
- **Dependencias:** ninguna
- **Paralelizable:** sí (con T1)

## T3 — Utils de auth: passwords, token de sesión, respuesta saneada
- **Dificultad:** high
- **Descripción:** Crear en `src/auth/`:
  - `password.util.ts` — `hashPassword`, `verifyPassword` (argon2, mismo patrón
    que `apiKeyHash` de tenants), `generateTemporaryPassword()`.
  - `session-token.util.ts` — genera token opaco random de 256 bits y su
    `sha256` hex (el hash es lo único que se persiste en `Session.tokenHash`).
  - `person-response.ts` — mapper `toPersonResponse(person)` →
    `{ id, tenantId, email, role, active }`, que NUNCA incluye `passwordHash`.
  - `authenticated-person-request.ts` — interfaz `AuthenticatedPersonRequest
    extends Request { person: Person & { tenant: Tenant }; session: Session }`.
  Ningún archivo de este grupo depende de Nest DI (son funciones puras /
  tipos), por eso se agrupan en una sola tarea atómica.
- **Valida (de forma indirecta, vía integración en T6/T9/T10/T11/T12):**
  AC-3 vía `test/auth-login.e2e-spec.ts::'AC-3: ninguna respuesta de bootstrap
  o login expone el hash de la contraseña'`; AC-17/AC-23 (contraseña temporal)
  vía `test/auth-people-management.e2e-spec.ts::'AC-17...'` y `'AC-23...'`.
- **Dependencias:** T1 (tipos `Person`/`Session`/`PersonRole` del cliente Prisma)
- **Paralelizable:** sí (con T4, T5)

## T4 — `login-rate-limiter.service.ts`
- **Dificultad:** high
- **Descripción:** Nuevo `src/auth/login-rate-limiter.service.ts` inyectando
  `REDIS_CLIENT` (ya `@Global()` en `src/common/redis.module.ts`). Clave
  `login:fail:<emailNormalizado>`. Métodos: `assertNotBlocked(email)` (lanza
  `HttpException(429)` si `GET >= LOGIN_MAX_FAILED_ATTEMPTS`),
  `registerFailure(email)` (`INCR` + `EXPIRE LOGIN_WINDOW_MINUTES*60` solo en
  el primer incremento), `reset(email)` (`DEL` en login exitoso). Cuenta SOLO
  fallidos, nunca éxitos (decisión técnica #3 del plan — no reusar
  `ThrottlerGuard`/`TenantThrottlerGuard`, que no distinguen éxito/fallo).
- **Valida:** AC-11 vía `test/auth-login.e2e-spec.ts::'AC-11: bloquea intentos
  de login tras 10 fallidos en 15 minutos para el mismo email (429)'`.
- **Dependencias:** T2 (env vars `LOGIN_MAX_FAILED_ATTEMPTS`, `LOGIN_WINDOW_MINUTES`)
- **Paralelizable:** sí (con T3, T5)

## T5 — DTOs de auth
- **Dificultad:** medium
- **Descripción:** Crear `src/auth/dto/login.dto.ts` (`email`, `password`,
  `class-validator`), `src/auth/dto/bootstrap-owner.dto.ts` (`email`,
  `password @MinLength(8)`), `src/auth/dto/create-person.dto.ts` (`email`,
  `role` con `@IsEnum(PersonRole)`, `password?` opcional con `@MinLength(8)`
  cuando viene). El `@MinLength(8)` es lo que produce el 400 pre-DB de AC-4.
- **Valida:** AC-4 vía `test/auth-login.e2e-spec.ts::'AC-4: rechaza crear una
  persona con password de menos de 8 caracteres, sin crear el registro'`.
- **Dependencias:** T1 (enum `PersonRole` del cliente Prisma)
- **Paralelizable:** sí (con T3, T4)

## T6 — `guards/person-session.guard.ts` (authN)
- **Dificultad:** high
- **Descripción:** Nuevo `src/auth/guards/person-session.guard.ts`. Extrae el
  token de `Authorization: Bearer <token>`; si falta o está malformado ⇒ 401
  sin tocar DB. Si viene, calcula `sha256(token)` (vía `session-token.util.ts`
  de T3) y busca `Session` por `tokenHash` incluyendo `person.tenant`; si no
  existe, `expiresAt < now`, `person.active === false` o `tenant.active ===
  false` ⇒ 401. Si es válida, adjunta `request.person` y `request.session`
  (interfaz `AuthenticatedPersonRequest` de T3) antes de dejar pasar al
  handler.
- **Valida:** AC-12 vía `test/auth-isolation.e2e-spec.ts::'AC-12: sin sesión
  válida (ausente o malformada/inválida) el guard responde 401 sin ejecutar el
  endpoint'`; AC-13 vía `'AC-13: con una sesión válida, el guard resuelve la
  persona y su tenantId antes de ejecutar la lógica del endpoint'`; también
  sostiene AC-7 (`test/auth-people-management.e2e-spec.ts::'AC-7: crear/listar/
  desactivar sin sesión de persona válida responde 401...'`), AC-20 y AC-22
  (rechazo de sesión revocada/expirada) vía los tests homónimos del mismo
  archivo.
- **Dependencias:** T1, T3
- **Paralelizable:** sí (con T9, T10)

## T7 — `guards/tenant-scope.guard.ts` (authZ, aislamiento)
- **Dificultad:** high
- **Descripción:** Nuevo `src/auth/guards/tenant-scope.guard.ts`. Corre
  después de `PersonSessionGuard`: compara `params.tenantId` de la ruta contra
  `request.person.tenantId`; si no coinciden ⇒ 403 sin ejecutar ninguna
  consulta ni mutación. Esta es la capa que corta cross-tenant a nivel de URL
  (defensa en profundidad junto al filtro por `tenantId` de T10 en el
  servicio).
- **Valida:** AC-14 vía `test/auth-isolation.e2e-spec.ts::'AC-14: una sesión de
  tenant A no puede leer datos scopeados a tenant B (403), sin filtrar nada de
  B'`; AC-15 vía `'AC-15: la sesión de tenant A jamás permite escribir datos
  bajo la URL de tenant B (403), sin crear nada allí'`.
- **Dependencias:** T6
- **Paralelizable:** sí (con T8, T11)

## T8 — `guards/owner-role.guard.ts` (authZ, rol)
- **Dificultad:** high
- **Descripción:** Nuevo `src/auth/guards/owner-role.guard.ts`. Corre después
  de `PersonSessionGuard`: si `request.person.role !== 'OWNER'` ⇒ 403. Protege
  listar/crear/desactivar/resetear-contraseña de personas, exclusivo para
  `OWNER`.
- **Valida:** AC-16 vía `test/auth-people-management.e2e-spec.ts::'AC-16: un
  AGENT no puede listar, crear ni desactivar personas (403)'`.
- **Dependencias:** T6
- **Paralelizable:** sí (con T7, T11)

## T9 — `auth.service.ts` (login/logout)
- **Dificultad:** high
- **Descripción:** Nuevo `src/auth/auth.service.ts`. `login(email, password)`:
  normaliza email a minúsculas; `LoginRateLimiterService.assertNotBlocked`
  antes de tocar DB (429, AC-11); busca `Person` por email; si no existe hace
  `argon2.verify` contra un hash dummy fijo para igualar el timing
  (anti-enumeración); valida `person.active` y `person.tenant.active`; en
  cualquier fallo (email inexistente, password incorrecta, persona inactiva,
  tenant inactivo) responde 401 con el mismo mensaje genérico único
  (`'Credenciales inválidas'`) y llama `registerFailure`; en éxito llama
  `reset`, crea `Session` (`tokenHash`, `expiresAt = now + SESSION_TTL_HOURS`)
  y devuelve `{ token }` (el token en claro, nunca el hash). `logout(token)`:
  borra la `Session` cuyo `tokenHash === sha256(token)`.
- **Valida:** AC-2 vía `test/auth-login.e2e-spec.ts::'AC-2: normaliza el email
  a minúsculas...'`; AC-8 vía `'AC-8: login con credenciales válidas...'`;
  AC-9 vía `'AC-9: rechaza login con mensaje genérico...'` y el caso de cuenta
  inactiva en `test/auth-people-management.e2e-spec.ts::'AC-9 (caso cuenta
  inactiva)...'`; AC-10 vía `test/auth-login.e2e-spec.ts::'AC-10: rechaza login
  ... si el tenant de la persona está inactivo'`; AC-11 vía `'AC-11: bloquea
  intentos de login tras 10 fallidos...'`; AC-22 vía
  `test/auth-people-management.e2e-spec.ts::'AC-22: logout invalida la
  sesión...'`.
- **Dependencias:** T1, T3, T4
- **Paralelizable:** sí (con T6, T10)

## T10 — `people.service.ts` (gestión de personas)
- **Dificultad:** high
- **Descripción:** Nuevo `src/auth/people.service.ts` con todo filtrado por
  `tenantId` de la sesión (nunca por el del body):
  - `bootstrapOwner(tenantId, dto)`: dentro de `prisma.$transaction`, re-chequea
    que no exista ya un owner activo del tenant (mitiga carrera) y crea
    `Person` `OWNER` activo; si ya hay uno ⇒ 409 sin crear.
  - `create(tenantId, dto)`: crea en el `tenantId` de la sesión; si viene
    `password` la usa (sin devolver `temporaryPassword`); si no, genera una
    (`password.util.ts`) y la devuelve una única vez; email duplicado global
    ⇒ captura `P2002` de Prisma ⇒ 409 sin crear.
  - `list(tenantId)`: `where: { tenantId }`.
  - `deactivate(tenantId, personId)`: `where: { id: personId, tenantId }`;
    dentro de `prisma.$transaction`, si dejaría al tenant sin ningún owner
    activo ⇒ 409 sin cambios; si no, `active = false` + `deleteMany` de sus
    `Session` (mismo transacción, sin ventana de sesión viva).
  - `resetPassword(tenantId, personId)`: `where: { id: personId, tenantId }`;
    dentro de `prisma.$transaction`, nuevo hash + `deleteMany` de sus
    `Session`; devuelve `temporaryPassword` una única vez.
  Todas las respuestas pasan por `toPersonResponse` (T3) antes de salir.
- **Valida:** AC-1 vía `test/auth-login.e2e-spec.ts::'AC-1: la persona creada
  queda asociada a tenant, email, rol y estado activo...'`; AC-5 vía `'AC-5:
  bootstrap crea el primer owner activo...'`; AC-6 vía `'AC-6: bootstrap
  rechaza con 409...'`; AC-17 vía
  `test/auth-people-management.e2e-spec.ts::'AC-17: un OWNER crea una nueva
  persona...'`; AC-18 vía `'AC-18: rechaza crear una persona con un email ya
  usado...'`; AC-19 vía `'AC-19: el listado de personas de un OWNER solo
  incluye a las de su propio tenant'`; AC-20 vía `'AC-20: desactivar una
  persona invalida logins nuevos y cualquier sesión previa...'`; AC-21 vía
  `'AC-21: rechaza desactivar al último owner activo del tenant...'`; AC-23 vía
  `'AC-23: un OWNER regenera la contraseña de otra persona...'`.
- **Dependencias:** T1, T3
- **Paralelizable:** sí (con T6, T9)

## T11 — `auth.controller.ts`
- **Dificultad:** high
- **Descripción:** Nuevo `src/auth/auth.controller.ts`. `POST /auth/login`
  (público, sin guard de personas; el `ThrottlerGuard` global por IP ya
  aplica), `LoginDto` (T5), 200 con `{ token }` o el código de error que
  propague `AuthService`. `POST /auth/logout`, protegido por
  `PersonSessionGuard` (T6), 200 `{ ok: true }`.
- **Valida:** hace alcanzable por HTTP la lógica de T9 — AC-2, AC-8, AC-9,
  AC-10, AC-11 vía los tests de login en `test/auth-login.e2e-spec.ts`
  (mismos `it(...)` citados en T9); AC-22 vía
  `test/auth-people-management.e2e-spec.ts::'AC-22: logout invalida la
  sesión...'`.
- **Dependencias:** T9, T5, T6
- **Paralelizable:** sí (con T7, T8)

## T12 — `admin-people.controller.ts`
- **Dificultad:** high
- **Descripción:** Nuevo `src/auth/admin-people.controller.ts`,
  `@Controller('admin/tenants/:tenantId/people')`. `POST /bootstrap-owner`
  protegido solo por `MasterKeyGuard` (existente en
  `src/admin/guards/master-key.guard.ts`, no se toca), `BootstrapOwnerDto`
  (T5), 201. `GET /` (`PersonSessionGuard` + `TenantScopeGuard` +
  `OwnerRoleGuard`, T6/T7/T8), 200 `{ people: PersonResponse[] }`. `POST /`
  (idem guards), `CreatePersonDto` (T5), 201. `PATCH /:personId/deactivate`
  (idem guards), 200. `POST /:personId/reset-password` (idem guards), 200.
  Todos los handlers delegan en `PeopleService` (T10) usando el `tenantId` de
  `request.person` (nunca el de params directamente, aunque ya coincide por
  `TenantScopeGuard`) y devuelven siempre vía `toPersonResponse`.
- **Valida:** hace alcanzable por HTTP la lógica de T10 y las tres capas de
  guards — AC-1, AC-4, AC-5, AC-6, AC-7 (ambos casos: sin master key en
  `test/auth-login.e2e-spec.ts::'AC-7...'` y sin sesión en
  `test/auth-people-management.e2e-spec.ts::'AC-7...'`), AC-16, AC-17, AC-18,
  AC-19, AC-20, AC-21, AC-23 vía los `it(...)` homónimos citados en T5/T8/T10;
  además AC-14/AC-15 vía `test/auth-isolation.e2e-spec.ts` (rutas `GET`/`POST`
  cross-tenant sobre este mismo controller).
- **Dependencias:** T10, T5, T6, T7, T8
- **Paralelizable:** no (necesita las tres capas de guards ya cerradas)

## T13 — Wiring: `auth.module.ts` + `app.module.ts`
- **Dificultad:** high
- **Descripción:** Nuevo `src/auth/auth.module.ts`: registra
  `AuthController`, `AdminPeopleController` y todos los providers de `src/auth/`
  (`AuthService`, `PeopleService`, `LoginRateLimiterService`,
  `PersonSessionGuard`, `TenantScopeGuard`, `OwnerRoleGuard`); reusa
  `PrismaModule`/`RedisModule` sin reimportarlos (ya `@Global()`). Modificar
  `src/app.module.ts`: agregar `AuthModule` al array `imports`, sin tocar
  `AdminModule` ni sus guards existentes. Este es el paso que efectivamente
  saca del 404 a las 25 rutas nuevas.
- **Valida:** habilita end-to-end AC-1 a AC-23 (todas las rutas quedan
  registradas en la app real que levantan los tres specs e2e vía
  `Test.createTestingModule({ imports: [AppModule] })`). Sin esta tarea,
  ninguno de los 25 tests puede pasar de 404.
- **Dependencias:** T11, T12
- **Paralelizable:** no

## T14 — Verificación final de la suite completa
- **Dificultad:** high
- **Descripción:** Correr `npm run test` (unit) y `npm run test:e2e` (con
  Postgres/Redis de `docker compose up -d`) contra el árbol completo.
  Confirmar: (a) los 25 tests de A.1 (`auth-login.e2e-spec.ts`,
  `auth-people-management.e2e-spec.ts`, `auth-isolation.e2e-spec.ts`) pasan en
  verde; (b) los 206 tests preexistentes siguen en verde (sin regresiones en
  `webhook`, `pipeline`, `conversation`, `admin`, etc.); (c) no quedan
  `console.log`/logs con `temporaryPassword` o `passwordHash` en claro. Si
  algo falla, la corrección vuelve a la tarea (T1–T13) responsable, no se
  parchea acá.
- **Valida:** AC-1 a AC-23 (los 25 `it(...)` de los tres archivos e2e) en
  conjunto, más ausencia de regresión en la suite existente.
- **Dependencias:** T13
- **Paralelizable:** no

## Orden de ejecución sugerido

> Lo usa `task-router` para despachar.

- **Grupo 1 (paralelo):** T1, T2
- **Grupo 2 (paralelo, depende de Grupo 1):** T3 (dep T1), T4 (dep T2), T5 (dep T1)
- **Grupo 3 (paralelo, depende de Grupo 2):** T6 (dep T1, T3), T9 (dep T1, T3, T4), T10 (dep T1, T3)
- **Grupo 4 (paralelo, depende de Grupo 3):** T7 (dep T6), T8 (dep T6), T11 (dep T9, T5, T6)
- **Grupo 5 (secuencial, depende de Grupo 4):** T12 (dep T10, T5, T6, T7, T8)
- **Grupo 6 (secuencial, depende de Grupo 5):** T13 (dep T11, T12)
- **Grupo 7 (secuencial, cierre):** T14 (dep T13)

## Cobertura de criterios

Chequeo de que los 23 AC de `spec.md` (25 tests) tienen al menos una tarea que
los valida:

- AC-1 → T10 ✓ (expuesto por T12)
- AC-2 → T9 ✓ (expuesto por T11)
- AC-3 → T3 ✓ (expuesto por T11/T12)
- AC-4 → T5 ✓ (expuesto por T12)
- AC-5 → T10 ✓ (expuesto por T12)
- AC-6 → T10 ✓ (expuesto por T12)
- AC-7 → T6 + T12 (MasterKeyGuard existente) ✓
- AC-8 → T9 ✓ (expuesto por T11)
- AC-9 → T9 ✓ (expuesto por T11); caso "cuenta inactiva" también en T10
- AC-10 → T9 ✓
- AC-11 → T4 + T9 ✓
- AC-12 → T6 ✓
- AC-13 → T6 ✓
- AC-14 → T7 ✓
- AC-15 → T7 ✓
- AC-16 → T8 ✓
- AC-17 → T10 ✓ (expuesto por T12)
- AC-18 → T10 ✓
- AC-19 → T10 ✓
- AC-20 → T10 + T6 ✓
- AC-21 → T10 ✓
- AC-22 → T9 + T6 ✓ (expuesto por T11)
- AC-23 → T10 ✓ (expuesto por T12)

Sin huecos: los 23 AC (25 tests, contando los dos casos de AC-7 y AC-9) quedan
cubiertos. T13 y T14 no agregan AC nuevos: T13 es la tarea de wiring que hace
observables todos los anteriores por HTTP, y T14 es el gate final que confirma
en verde sin regresión.
