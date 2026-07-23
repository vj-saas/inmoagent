# Plan A.1: Autenticación de personas y roles

## Arquitectura

Módulo NestJS nuevo `src/auth/`, autocontenido, que convive con `src/admin/` sin
tocarlo. Introduce el concepto de **persona humana** (modelo `Person`) y de
**sesión de servidor respaldada en Postgres** (modelo `Session`), separado por
completo de la auth de máquina existente (`MasterKeyGuard`, `TenantApiKeyGuard`),
que no se modifica.

Flujo general:

```
POST /auth/login  (público)
  └─ AuthService.login: rate-limit por email (Redis) → verifica argon2 →
     valida person.active + tenant.active → crea Session en DB → devuelve { token }

Request a endpoint protegido  (Authorization: Bearer <token>)
  └─ PersonSessionGuard  (authN)   → sha256(token) → busca Session (+person+tenant)
        · ausente/malformada/expirada/persona inactiva/tenant inactivo ⇒ 401
        · ok ⇒ adjunta request.person y request.session
  └─ TenantScopeGuard    (authZ)   → params.tenantId === person.tenantId ? sino 403
  └─ OwnerRoleGuard       (authZ)  → person.role === OWNER ? sino 403
  └─ Handler + Service (toda query filtrada por tenantId de la sesión)
```

La sesión es **opaca y respaldada en DB** (no JWT autocontenido). Ver "Decisiones
técnicas #1" para la justificación completa. El token opaco viaja como
`Authorization: Bearer <token>` (contrato fijado por los e2e); en DB se guarda solo
su `sha256`, nunca el token en claro.

Encaje: `PrismaModule` y `RedisModule` ya son `@Global()`, así que el módulo nuevo
los inyecta sin re-importarlos. El `ThrottlerGuard` global por IP (`APP_GUARD` en
`app.module.ts`) sigue aplicando a `/auth/login` como capa adicional; el límite
por email de AC-11 es lógica propia sobre Redis.

## Entidades / módulos afectados

### Prisma (`prisma/schema.prisma`) — MODIFICADO (migración nueva)
- **enum `PersonRole`** nuevo: `OWNER | AGENT`.
- **model `Person`** nuevo: `id`, `tenantId` (+relación `Tenant`, `onDelete: Cascade`),
  `email @unique` (único global, minúsculas), `passwordHash` (argon2), `role`,
  `active @default(true)`, `sessions Session[]`, timestamps. Índices:
  `@@index([tenantId])` y `@@index([tenantId, role, active])` (chequeo de "último
  owner activo" AC-21 y listado AC-19).
- **model `Session`** nuevo: `id`, `tokenHash @unique` (sha256 hex), `personId`
  (+relación `Person`, `onDelete: Cascade`), `expiresAt`, `createdAt`. Índices:
  `@@index([personId])` (revocación masiva AC-20/22/23) y `@@index([expiresAt])`
  (purga). NO se denormaliza `tenantId` en `Session`: el guard ya carga `person`
  (con `tenant`) para validar `active`, así que el `tenantId` sale de ahí sin costo
  extra; menos superficie de inconsistencia.
- **model `Tenant`** MODIFICADO: agregar relación inversa `people Person[]`. El
  cascade `Tenant → Person → Session` garantiza que el `tenant.deleteMany` de los
  e2e (`afterAll`) limpie todo.
- **Migración Prisma nueva** `add_person_and_session` (`npx prisma migrate dev
  --name add_person_and_session`). Clasificada **high** por CLAUDE.md (cambio de
  schema).

### `src/config/env.schema.ts` — MODIFICADO
- `SESSION_TTL_HOURS` (coerce number, default 12).
- `LOGIN_MAX_FAILED_ATTEMPTS` (default 10) y `LOGIN_WINDOW_MINUTES` (default 15).
- Actualizar `.env.example` en consecuencia.

### `src/auth/` — NUEVO
- `auth.module.ts` — controllers + providers; se registra en `app.module.ts`.
- `auth.service.ts` — `login`, `logout`, emisión/revocación de sesiones, hashing.
- `people.service.ts` — `bootstrapOwner`, `create`, `list`, `deactivate`,
  `resetPassword`; todo scopeado por `tenantId`.
- `login-rate-limiter.service.ts` — contador de fallidos por email en Redis (AC-11).
- `auth.controller.ts` — `POST /auth/login`, `POST /auth/logout`.
- `admin-people.controller.ts` — `@Controller('admin/tenants/:tenantId/people')`.
- `guards/person-session.guard.ts` — authN de sesión (401).
- `guards/tenant-scope.guard.ts` — aislamiento tenant de la URL vs sesión (403).
- `guards/owner-role.guard.ts` — solo OWNER (403).
- `dto/login.dto.ts`, `dto/bootstrap-owner.dto.ts`, `dto/create-person.dto.ts`.
- `session-token.util.ts` — genera token opaco + `sha256`.
- `password.util.ts` — `hashPassword`, `verifyPassword`, `generateTemporaryPassword`.
- `authenticated-person-request.ts` — interfaz `AuthenticatedPersonRequest extends
  Request { person: Person & { tenant: Tenant }; session: Session }`.
- `person-response.ts` — mapper a `{ id, tenantId, email, role, active }` (sanea hash).

### `src/app.module.ts` — MODIFICADO
- Importar `AuthModule`.

## Decisiones técnicas

**1. Sesión opaca respaldada en Postgres (modelo `Session`), NO JWT stateless.** —
AC-20/AC-22/AC-23 exigen revocar una sesión activa *antes* de su expiración
natural. Con una sesión en DB, la revocación es un `DELETE` filtrado por
`personId` (revocar todas) o por `tokenHash` (revocar la actual), atómico y
auditable, en la misma transacción que la mutación que lo motiva. El token es un
random de 256 bits; el guard hace un lookup indexado por `sha256(token)` en cada
request.
  - *Descartado — JWT puramente stateless:* imposible revocar antes de expirar ⇒
    incumple AC-20/22/23 sin maquinaria extra.
  - *Descartado — JWT + blocklist en Redis:* agrega un segundo store que hay que
    consultar en CADA request; si el chequeo se omite en algún path, un token
    revocado sigue valiendo — un agujero silencioso en una superficie clasificada
    crítica (aislamiento). Más riesgo, cero beneficio acá.
  - *Descartado — JWT + `sessionVersion` en DB:* obliga a leer la DB por request
    igual (para comparar versión), perdiendo la única ventaja del JWT, y solo
    permite revocar por-persona, no por-sesión. Si vamos a pegarle a la DB igual,
    una fila de sesión opaca es más simple y más potente.
  - *Descartado — sesiones en Redis:* rápidas, pero "invalidar todas las sesiones
    de la persona X" requiere un índice inverso `person→sessions` (más piezas), y
    un flush de Redis desloguea a todos. En SQL la invalidación masiva es un
    `deleteMany({ where: { personId } })` trivialmente correcto. Reconsiderable si
    el panel escala en tráfico.
  - Duración: **12 h** (`SESSION_TTL_HOURS`, ya decidido). El guard rechaza si
    `expiresAt < now` (AC-12 "expirada").

**2. `sha256` del token en reposo, no argon2.** — El token de sesión es
alta-entropía (32 bytes random), no una contraseña adivinable; argon2 (lento,
deliberadamente) es para secretos de baja entropía. Además el lookup de sesión es
*por el token* (sin `tenantId` en la ruta como sí tiene `TenantApiKeyGuard`), así
que necesita un hash **determinístico e indexable** — `argon2.verify` obligaría a
escanear todas las filas. `sha256` da lookup O(1) por índice único y protección en
reposo (una fuga de DB no expone tokens usables). Las **contraseñas de persona**
sí van con **argon2** (reusa el patrón de `tenants-admin.service.ts` /
`common/crypto.ts`).

**3. Rate limiting de login por contador de fallidos en Redis (AC-11), no
`ThrottlerGuard`.** — AC-11 pide contar **solo intentos fallidos** por email y
bloquear el intento 11 *incluso con credenciales correctas*. `@nestjs/throttler`
incrementa por *toda* request antes del handler (no distingue éxito/fallo), y
`TenantThrottlerGuard` trackea por `tenantId`/`phone_number_id`, no por email del
body. `LoginRateLimiterService` sobre `REDIS_CLIENT`: clave
`login:fail:<emailNormalizado>`, TTL 15 min. En `login()`: (a) al entrar, si
`GET >= 10` ⇒ lanza `HttpException(429)` *antes* de verificar credenciales; (b) si
la verificación falla, `INCR` (+ `EXPIRE 900` en el primer incremento) y lanza
401; (c) si tiene éxito, `DEL` la clave (reset). Así "solo fallidos cuentan" y el
11 con clave correcta igual da 429.
  - *Descartado — subclase de `ThrottlerGuard` keyed por email:* pasaría el test
    pero contaría también los logins exitosos (bloquearía a un usuario legítimo
    activo), semántica más laxa que la del AC. Se prioriza fidelidad al AC en una
    superficie de seguridad.

**4. Aislamiento en dos capas: guard de scope + filtro por `tenantId` en el
servicio.** — `TenantScopeGuard` corta cross-tenant por la URL (`params.tenantId
!== person.tenantId ⇒ 403`, AC-14/15), y *además* todo método de `PeopleService`
filtra por el `tenantId` de la sesión (`where: { id: personId, tenantId }`), de
modo que un `personId` de otro tenant bajo la URL propia da 404 (defensa en
profundidad, por convención "toda query filtrada por tenantId"). Nunca se confía
en una sola capa para el aislamiento.

**5. Guards separados por responsabilidad, ordenados 401 → 403.** —
`PersonSessionGuard` (authN, 401) corre primero; luego `TenantScopeGuard` y
`OwnerRoleGuard` (authZ, 403). Coherente con el estilo explícito de la casa
(guards simples tipo `MasterKeyGuard`), sin metadata/reflector. `bootstrap-owner`
usa solo `MasterKeyGuard` (auth de plataforma, sin sesión de persona).

**6. Transacciones para operaciones "mutación + revocación".** — `deactivate` y
`resetPassword` hacen el `update` de la persona y el `deleteMany` de sus sesiones
dentro de `prisma.$transaction`, para que no exista ventana donde la sesión vieja
siga siendo usable tras la mutación (AC-20/AC-23).

**7. Respuestas saneadas por mapper explícito.** — Los controllers nunca devuelven
la entidad Prisma (que trae `passwordHash`): siempre `toPersonResponse(person)`
→ `{ id, tenantId, email, role, active }`. La contraseña temporal (AC-17/AC-23) se
agrega solo en esa respuesta puntual, generada con `generateTemporaryPassword()` y
nunca persistida en claro ni logueada (AC-3/AC-8).

## Endpoints (mapeo test e2e → diseño)

| Método + ruta | Guards | DTO entrada | Respuesta | HttpCode | AC |
|---|---|---|---|---|---|
| `POST /auth/login` | — (público; ThrottlerGuard IP global) + rate-limit email interno | `LoginDto { email, password }` | `{ token }` | 200 | 2, 8, 9, 10, 11 |
| `POST /auth/logout` | `PersonSessionGuard` | — | `{ ok: true }` | 200 | 22 |
| `POST /admin/tenants/:tenantId/people/bootstrap-owner` | `MasterKeyGuard` | `BootstrapOwnerDto { email, password }` | `PersonResponse` | 201 | 1, 2, 3, 4, 5, 6, 7 |
| `GET /admin/tenants/:tenantId/people` | `PersonSessionGuard`, `TenantScopeGuard`, `OwnerRoleGuard` | — | `{ people: PersonResponse[] }` | 200 | 7, 12, 13, 14, 15, 16, 19 |
| `POST /admin/tenants/:tenantId/people` | idem | `CreatePersonDto { email, role, password? }` | `PersonResponse (+ temporaryPassword?)` | 201 | 15, 16, 17, 18 |
| `PATCH /admin/tenants/:tenantId/people/:personId/deactivate` | idem | — | `PersonResponse` | 200 | 16, 20, 21 |
| `POST /admin/tenants/:tenantId/people/:personId/reset-password` | idem | — | `PersonResponse + temporaryPassword` | 200 | 16, 23 |

Detalles de comportamiento clave por endpoint:
- **login**: normaliza email a minúsculas; si email no existe hace un
  `argon2.verify` contra un hash dummy para igualar timing (anti-enumeración,
  AC-9); mensaje de error único y genérico (`'Credenciales inválidas'`) para
  email inexistente / password incorrecta / persona inactiva / tenant inactivo
  (AC-9/AC-10); rate-limit antes de verificar (AC-11 → 429).
- **logout**: borra la `Session` cuyo `tokenHash` coincide con el token del request
  (adjuntado por el guard). Segundo uso ⇒ guard no encuentra sesión ⇒ 401 (AC-22).
- **bootstrap-owner**: `password` con `@MinLength(8)` ⇒ 400 sin crear (AC-4);
  crea `OWNER` activo solo si el tenant no tiene ningún owner activo, si no 409
  (AC-5/AC-6); sin master key ⇒ 401 (AC-7). En transacción con re-chequeo del
  owner activo para mitigar carrera (ver riesgos).
- **create person**: crea en el `tenantId` de la sesión (ignora cualquier tenant
  del body); si `password` viene, se usa (y NO se devuelve `temporaryPassword`);
  si no viene, se genera y se devuelve `temporaryPassword` una única vez (AC-17);
  email duplicado global ⇒ 409 vía `P2002` sin crear (AC-18).
- **deactivate**: `where: { id: personId, tenantId }`; si dejaría al tenant sin
  OWNER activo ⇒ 409 sin cambios (AC-21, chequeo dentro de la transacción);
  si no, `active=false` + `deleteMany` de sus sesiones (AC-20).
- **reset-password**: `where: { id: personId, tenantId }`; nuevo hash + `deleteMany`
  de sus sesiones en transacción; devuelve `temporaryPassword` una vez (AC-23).

## Trazabilidad (AC-n → diseño)

- **AC-1** — `Person` con `tenantId`, `email`, `passwordHash`, `role`, `active`.
- **AC-2** — `email @unique` global + normalización a minúsculas en service antes
  de escribir/leer; e2e verifica login case-insensitive.
- **AC-3** — `passwordHash` argon2; mapper `toPersonResponse` excluye el hash;
  nunca se loguea.
- **AC-4** — `@MinLength(8)` en `BootstrapOwnerDto`/`CreatePersonDto` ⇒ 400 pre-DB.
- **AC-5** — `bootstrapOwner` crea `OWNER` activo si no hay owner activo.
- **AC-6** — chequeo de owner activo ⇒ 409.
- **AC-7** — `MasterKeyGuard` en bootstrap; `PersonSessionGuard` en el resto ⇒ 401
  antes de tocar la DB.
- **AC-8** — `login` con credenciales válidas + persona/tenant activos ⇒ 200 `{ token }`
  sin hash.
- **AC-9** — mensaje genérico único; verify contra hash dummy si el email no existe.
- **AC-10** — `login` valida `tenant.active`; mismo mensaje genérico ⇒ 401.
- **AC-11** — `LoginRateLimiterService` (Redis, 10/15min por email) ⇒ 429, incluso
  con credenciales correctas.
- **AC-12** — `PersonSessionGuard`: sesión ausente/malformada/expirada ⇒ 401.
- **AC-13** — el guard resuelve `person` + `tenantId` y los adjunta antes del handler.
- **AC-14** — `TenantScopeGuard`: `params.tenantId !== person.tenantId ⇒ 403`;
  además el service filtra por `tenantId` (nada de B se consulta/filtra).
- **AC-15** — misma capa aplica a escrituras (`POST people` bajo URL de B ⇒ 403,
  no crea nada).
- **AC-16** — `OwnerRoleGuard`: `AGENT` ⇒ 403 en listar/crear/desactivar.
- **AC-17** — `create` sin password ⇒ genera y devuelve `temporaryPassword` una vez.
- **AC-18** — email global duplicado ⇒ `P2002` ⇒ 409 sin crear.
- **AC-19** — `list` filtra `where: { tenantId }` de la sesión.
- **AC-20** — `deactivate` marca inactivo + borra sesiones (transacción); guard
  también valida `person.active` ⇒ token viejo 401.
- **AC-21** — chequeo "último owner activo" dentro de la transacción ⇒ 409 sin cambios.
- **AC-22** — `logout` borra la `Session` actual ⇒ reuso 401.
- **AC-23** — `resetPassword`: nuevo hash + borrado de sesiones (transacción) +
  `temporaryPassword` una vez.

## Riesgos y edge cases

- **Hit a DB por request protegido** (lookup de sesión). Aceptable: el panel es
  bajo tráfico y NO está en el hot-path del webhook (<1s). Trade-off consciente vs
  JWT stateless.
- **Crecimiento de la tabla `Session`**: sesiones expiradas quedan hasta purga.
  Mitigación: índice `@@index([expiresAt])` + tarea de purga (el `MaintenanceModule`
  existente es el lugar natural; purga fuera del alcance estricto de A.1, se anota
  como follow-up).
- **DoS de bloqueo de cuenta (AC-11)**: un atacante que spamea fallos por el email
  de una víctima puede bloquearla 15 min. Aceptado por el AC; el ThrottlerGuard por
  IP global limita el abuso. Mejorable a futuro combinando clave email+IP.
- **Enumeración de usuarios por timing** en login: mitigado con `argon2.verify`
  contra hash dummy cuando el email no existe, + mensaje genérico único (AC-9).
- **Carrera en bootstrap / "último owner"**: dos requests concurrentes podrían
  pasar el chequeo y crear/quitar owners a la vez. Mitigación: hacer el chequeo +
  la escritura dentro de `prisma.$transaction`. Residual: Prisma no expresa
  fácilmente un índice único parcial "un owner activo por tenant"; el riesgo es
  bajo (operación manual y esporádica) y se documenta.
- **Consistencia de cascade para los e2e**: `Tenant → Person (Cascade) → Session
  (Cascade)` debe estar bien declarado o el `tenant.deleteMany` del `afterAll`
  falla por FK. Verificar en la migración.
- **`temporaryPassword` en logs**: prohibido loguear el body de estas respuestas;
  el `redact` de pino ya oculta `authorization`, pero hay que asegurar no loguear
  el objeto de respuesta de create/reset.

## Follow-up fuera de alcance de A.1

- **Purga de sesiones expiradas.** El índice `@@index([expiresAt])` ya lo deja
  preparado, pero el job de purga en sí (análogo al de `WebhookEvent` en
  `MaintenanceModule`) se implementa después, no en A.1.

## Decisiones que requieren aprobación humana (pipeline crítico)

1. **Sesión opaca en Postgres (no JWT)** como mecanismo de sesión — cierra la
   pregunta abierta #1 del spec. (Decisión técnica #1.)
2. **`sha256` para el token en reposo** (argon2 solo para contraseñas). (#2.)
3. **Rate-limit AC-11 vía contador Redis propio**, apartándose de `TenantThrottlerGuard`
   por semántica "solo fallidos". (#3.)
4. **Ubicar el controller de personas en `src/auth/`** con rutas namespaced
   `/admin/tenants/:tenantId/people`, sin tocar `AdminModule` ni sus guards.
5. **Nuevas env vars** `SESSION_TTL_HOURS`, `LOGIN_MAX_FAILED_ATTEMPTS`,
   `LOGIN_WINDOW_MINUTES`.
