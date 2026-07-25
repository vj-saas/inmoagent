# Plan V-C: Onboarding de tenant sin tocar código

> Producido por planner. Define CÓMO se construye lo que la spec (V-C) pide.
> Fase con migración Prisma (**high**, no crítica) + dos endpoints que resuelven
> datos por `tenantId` (**crítico**: aislamiento multi-tenant) + un cambio en
> `buildGreetingMessage` que toca la regla de negocio 5 de `CLAUDE.md`
> (**crítico**: aviso Ley 25.326 en el primer mensaje). Todo el aislamiento se
> resuelve reusando la cadena de guards ya vigente (`PersonSessionGuard →
> TenantScopeGuard → OwnerRoleGuard`), sin introducir ninguna query cross-tenant
> nueva.

## Corrección de referencia respecto de la spec

La spec menciona `src/llm/prompts.ts` como sede de
`buildGreetingMessage`/`buildHandoffFarewell`. **No existe ese archivo**: ambas
funciones viven en `src/conversation/templates.ts` (mensajes 100% deterministas,
sin LLM, según `docs/03-CONVERSACION.md`). Esto es una buena noticia para el
guardrail: el saludo con el aviso Ley 25.326 nunca pasa por el LLM, así que
`welcomeIntro` se inyecta en una función pura y testeable, no en un prompt.

## Arquitectura

Cuatro frentes, acoplados solo por contratos HTTP y por el modelo `Tenant`:

- **DB / Prisma (high):** una sola migración aditiva. Dos columnas nullable en
  `Tenant` (`welcomeIntro`, `handoffIntro`) + un índice compuesto en
  `WebhookEvent` (`[tenantId, receivedAt]`) que necesita `webhook-status` (ver
  decisión de índice). Sin backfill, sin cambio de tipos existentes, sin
  reescritura de filas.

- **Backend admin (medium, salvo el aislamiento que es crítico y ya vigente):**
  los dos endpoints nuevos cuelgan del `AdminTenantsController` **existente**
  (`src/admin/tenants/admin-tenants.controller.ts`), que ya tiene el prefijo
  `admin/tenants`. La lógica va al `TenantsAdminService` existente (`updateConfig`
  y `webhookStatus`). No se crea módulo ni controller nuevo. Único ajuste de
  cableado: `AuthModule` hoy exporta `PersonSessionGuard` y `TenantScopeGuard`
  pero **no** `OwnerRoleGuard`; hay que agregarlo al `exports` para que Nest lo
  pueda inyectar en un controller de `AdminModule`.

- **Capa de mensajes deterministas (crítico):** `buildGreetingMessage` y
  `buildHandoffFarewell` pasan de "texto fijo" a "texto fijo con una frase
  introductoria sustituible". La estructura del mensaje la sigue armando el
  backend: la línea de privacidad y la de `humanHours` se concatenan siempre
  fuera del texto configurable. `GreetingHandler` y `ConversationEngine` no se
  tocan.

- **Frontend (medium):** dos rutas nuevas (`/onboarding` y `/configuracion`),
  un wizard de 3 pasos, y una tarjeta de estado de conexión. Se agregan las
  funciones de API en `src/api/endpoints.ts` y soporte de `FormData` en
  `src/api/http-client.ts` (hoy fuerza `Content-Type: application/json`, así que
  el import CSV desde el navegador **no funciona** sin ese cambio).

Flujo del wizard (todas llamadas a endpoints independientes, reintentables por
paso — decisión 1 de la spec):

```
Paso 1  POST /admin/tenants                      (X-Master-Key)  -> { tenantId, apiKey }
        POST /admin/tenants/:id/people/bootstrap-owner (X-Master-Key) -> OWNER creado
        POST /auth/login (email+password del owner recién creado)  -> { token }  [en memoria]
Paso 2  guía Meta (copy estático, cero backend)
        POST /admin/tenants/:id/properties/import (Bearer token, multipart) -> { imported, errors[] }
Paso 3  PATCH /admin/tenants/:id/config           (Bearer token, OWNER)
        GET   /admin/tenants/:id/webhook-status   (Bearer token)  -> checklist "qué falta"
```

## Entidades / módulos afectados

### DB (prisma/schema.prisma) — migración
- **model Tenant (modifica):** `+ welcomeIntro String?`, `+ handoffIntro String?`.
- **model WebhookEvent (modifica):** `+ @@index([tenantId, receivedAt])`.

### Backend
- `prisma/migrations/<timestamp>_add_tenant_intro_texts_and_webhook_event_tenant_index/migration.sql`
  (**nuevo**, generado con `npx prisma migrate dev --name
  add_tenant_intro_texts_and_webhook_event_tenant_index`).
- `src/admin/tenants/update-tenant-config.dto.ts` (**nuevo**): DTO con los 11
  campos editables, todos `@IsOptional()`.
- `src/admin/tenants/tenant-config-response.ts` (**nuevo**): tipo
  `TenantConfigResponse` + el `select` de Prisma que lo produce (whitelist
  explícita de columnas, nunca `accessTokenEnc`/`apiKeyHash`).
- `src/admin/tenants/tenants-admin.service.ts` (**modifica**): `+ updateConfig(tenantId, dto)`,
  `+ webhookStatus(tenantId)`. `create()` y `updateAccessToken()` intactos (AC-16).
- `src/admin/tenants/admin-tenants.controller.ts` (**modifica**): `+ PATCH :tenantId/config`,
  `+ GET :tenantId/webhook-status`. Los dos handlers existentes intactos (AC-16).
- `src/auth/auth.module.ts` (**modifica**): agrega `OwnerRoleGuard` a `exports`.
- `src/conversation/templates.ts` (**modifica**): `buildGreetingMessage` y
  `buildHandoffFarewell` respetan `tenant.welcomeIntro` / `tenant.handoffIntro`.
- `src/main.ts` (**modifica**): `allowedHeaders` de CORS suma `'X-Master-Key'`
  (sin esto el paso 1 del wizard es imposible desde el navegador — bloquea AC-13).

### Backend — tests
- `src/conversation/templates.spec.ts` (**modifica**): bloques nuevos para el
  guardrail Ley 25.326 y el handoff (AC-5, AC-6, AC-7, AC-8).
- `test/admin-tenant-config.e2e-spec.ts` (**nuevo**): AC-1 a AC-4 y AC-9 a AC-12.
- `test/onboarding-wizard.e2e-spec.ts` (**nuevo**): cadena completa AC-13, AC-14,
  AC-15.

### Frontend
- `frontend/src/api/http-client.ts` (**modifica**): soporte `FormData`.
- `frontend/src/api/endpoints.ts` (**modifica**): `createTenant`, `bootstrapOwner`,
  `importPropertiesCsv`, `updateTenantConfig`, `getWebhookStatus`.
- `frontend/src/routes/OnboardingWizardPage.tsx` (**nuevo**): orquesta los 3 pasos.
- `frontend/src/routes/TenantConfigPage.tsx` (**nuevo**): edición posterior + estado
  de conexión.
- `frontend/src/components/onboarding/WizardStepper.tsx` (**nuevo**).
- `frontend/src/components/onboarding/TenantCreateForm.tsx` (**nuevo**, paso 1).
- `frontend/src/components/onboarding/ApiKeyReveal.tsx` (**nuevo**, "no se vuelve a mostrar").
- `frontend/src/components/onboarding/MetaSetupGuide.tsx` (**nuevo**, copy estático).
- `frontend/src/components/onboarding/CsvUploader.tsx` (**nuevo**, paso 2 + reporte por fila).
- `frontend/src/components/onboarding/TenantConfigForm.tsx` (**nuevo**, paso 3, reusado
  por `TenantConfigPage`).
- `frontend/src/components/onboarding/WebhookStatusCard.tsx` (**nuevo**).
- `frontend/src/components/onboarding/ReadinessChecklist.tsx` (**nuevo**, "qué falta").
- `frontend/src/App.tsx` (**modifica**): `/onboarding` fuera de `ProtectedRoute`;
  `/configuracion` dentro.
- `frontend/src/index.css` (**modifica**): clases del wizard (sin `style={{}}`).
- Tests `*.test.tsx` junto a cada componente/ruta nueva (patrón vigente).

### Sin cambios (explícito)
- `src/admin/properties/csv-import.service.ts` y su controller — se reusan tal cual.
- `src/webhook/*` — el endpoint público no cambia (AC-14 es regresión, no feature).
- `src/conversation/handlers/greeting.handler.ts`, `conversation.engine.ts` — siguen
  llamando a las mismas funciones con la misma firma.
- `MasterKeyGuard`, `TenantApiKeyGuard`, `PersonOrApiKeyGuard` — sin cambios.

## Migración Prisma

Nombre: `add_tenant_intro_texts_and_webhook_event_tenant_index`.
Ruta: `prisma/migrations/<timestamp>_add_tenant_intro_texts_and_webhook_event_tenant_index/migration.sql`.

Diff conceptual del schema:

```prisma
model Tenant {
  // ... campos existentes ...
  welcomeIntro String?  // NUEVO: primera frase del saludo (el aviso Ley 25.326 lo agrega el backend)
  handoffIntro String?  // NUEVO: frase intro del handoff (la línea de humanHours la agrega el backend)
}

model WebhookEvent {
  // ... campos existentes ...
  @@index([receivedAt])            // existente (purga)
  @@index([tenantId, receivedAt])  // NUEVO (webhook-status)
}
```

SQL resultante esperado (tres sentencias, ningún backfill):

```sql
ALTER TABLE "Tenant" ADD COLUMN "welcomeIntro" TEXT;
ALTER TABLE "Tenant" ADD COLUMN "handoffIntro" TEXT;
CREATE INDEX "WebhookEvent_tenantId_receivedAt_idx" ON "WebhookEvent"("tenantId", "receivedAt");
```

Decisiones de la migración:

- **Dos `ADD COLUMN` nullable, sin default.** En Postgres, agregar una columna
  nullable sin default es puro cambio de catálogo: no reescribe la tabla, no toma
  lock largo, no necesita backfill. `NULL` es semánticamente correcto como "el
  tenant no configuró nada" y es exactamente el caso de AC-6 (comportamiento
  idéntico al de hoy). Alternativa descartada: `@default("")` — obligaría a
  distinguir `""` de `NULL` sin ganar nada, y `""` ya se normaliza a `NULL` en el
  service.
- **`String?` (TEXT) y no `@db.VarChar(n)`.** El límite de longitud es una regla
  de producto (mensaje de WhatsApp), no de almacenamiento; se valida en el DTO con
  `@MaxLength`, donde el error es 400 con mensaje legible en español en vez de un
  error de driver. Consistente con el resto del schema, que no usa VarChar para
  texto libre.
- **`@@index([tenantId, receivedAt])` — SÍ hace falta, y va en esta misma
  migración.** El único query nuevo contra `WebhookEvent` es "el evento más
  reciente de este tenant". El índice existente es `([receivedAt])` a secas:
  Postgres puede recorrerlo hacia atrás filtrando por `tenantId`, y para un tenant
  activo encuentra la fila enseguida — **pero el peor caso es precisamente el caso
  de uso principal**: un tenant recién creado que todavía no recibió nada (AC-9)
  obliga a recorrer el índice/tabla entero antes de responder `null`, y ese es el
  estado en el que la pantalla de estado se mira (y se refresca) durante todo el
  onboarding. La tabla está acotada por la purga de `MaintenanceProcessor`
  (>30 días, `src/maintenance/maintenance.processor.ts`), así que el `CREATE INDEX`
  es rápido y el costo de escritura extra por INSERT es marginal frente al
  presupuesto de <1s del webhook. Alternativas descartadas:
  (a) no indexar y aceptar el scan — falla justo en el caso "tenant nuevo", que es
  el 100% del tráfico de este endpoint durante el onboarding;
  (b) derivar `lastEventAt` de `Message` en vez de `WebhookEvent` — perdería los
  eventos sin mensaje persistible (status updates), que la spec pide contar
  explícitamente, y además `Message` está indexado por `[tenantId, leadId,
  createdAt]`, que tampoco resuelve un MAX por tenant.
- **`Lead.lastMessageAt` NO necesita índice nuevo.** `@@index([tenantId,
  lastMessageAt])` ya existe y cubre exactamente el `ORDER BY lastMessageAt DESC
  LIMIT 1` filtrado por `tenantId`.
- Clasificación: **high** por ser cambio de schema; **no** crítica (no toca
  aislamiento ni guardrails del LLM).

## Decisiones técnicas

### DTO de `PATCH /admin/tenants/:tenantId/config`

- **`UpdateTenantConfigDto` con los 11 campos, todos `@IsOptional()`, y NADA más.**
  La whitelist del `ValidationPipe` global (`src/app.module.ts`:
  `new ValidationPipe({ whitelist: true, transform: true })`) elimina del body
  cualquier propiedad no declarada en el DTO **antes** de llegar al handler. Como
  `accessToken`, `phoneNumberId`, `wabaId`, `slug` y `apiKeyHash` no existen en el
  DTO, se descartan silenciosamente y el service nunca los ve: AC-3 queda cubierto
  por construcción, con la rama "ignorar" (200 + campos protegidos intactos).
  Alternativa descartada: `forbidNonWhitelisted: true` local para devolver 400.
  Motivos: (a) cambiaría la semántica solo de este endpoint, rompiendo la
  consistencia con el resto del admin; (b) un frontend que reenvíe el objeto
  tenant completo (patrón habitual en formularios de edición) fallaría entero en
  vez de actualizar lo editable; (c) el AC-3 acepta explícitamente "ignorar".
  La protección real no es el 400: es que el service arma el `data` del `update`
  campo por campo desde el DTO tipado, **nunca con spread del body crudo**.

Forma del DTO (validadores calcados de `CreateTenantDto` para el mismo campo):

```
alertPhone?         @IsOptional() @IsString() @MaxLength(32)
alertsEnabled?      @IsOptional() @IsBoolean()
humanHours?         @IsOptional() @IsString() @MaxLength(200)
botName?            @IsOptional() @IsString() @MinLength(1) @MaxLength(60)
botTone?            @IsOptional() @IsString() @MinLength(1) @MaxLength(300)
schedulingLink?     @IsOptional() @IsString() @MaxLength(500)
coverageAreas?      @IsOptional() @IsArray() @IsString({each:true}) @ArrayMaxSize(100)
competitorsToAvoid? @IsOptional() @IsArray() @IsString({each:true}) @ArrayMaxSize(100)
displayPhone?       @IsOptional() @IsString() @MaxLength(32)
welcomeIntro?       @IsOptional() @IsString() @MaxLength(500)
handoffIntro?       @IsOptional() @IsString() @MaxLength(300)
```

- **`botName`/`botTone` con `@MinLength(1)`, el resto sin mínimo.** Son `NOT NULL`
  con default en el schema: vaciarlos dejaría al bot presentándose como
  "Soy , de Inmobiliaria X". Los demás son nullable y su vacío es legítimo.
- **`@MaxLength` en `welcomeIntro` (500) y `handoffIntro` (300).** El límite duro
  de un mensaje de texto de WhatsApp es 4096 caracteres y el backend concatena
  ~250 más (aviso legal + pregunta de operación). 500/300 dejan margen enorme y
  además cumplen una función de producto: la frase introductoria tiene que seguir
  siendo una frase, no un contrato. Sin ese límite un tenant puede empujar el
  aviso Ley 25.326 tan abajo que quede fuera de la vista previa del chat — una
  forma indirecta de violar la regla de negocio 5.
- **Semántica de borrado: string vacío limpia el campo (se persiste NULL), campo
  ausente no se toca. NO se usa el patrón de body crudo de `PatchAssignmentDto`.**
  En A.4 esa complejidad era necesaria porque `null` era un valor semánticamente
  distinto y significativo (desasignar, limpiar una fecha) sobre campos que no son
  texto libre. Acá los 9 campos nullables son texto/array de texto libre, y el
  string vacío es la forma natural, inequívoca y directamente expresable desde un
  input de "quiero borrar esto" — un formulario web manda vacío, no `null`. El
  service normaliza: `trim()`, y si queda vacío escribe `null`. Los arrays se
  limpian mandando `[]`. Resultado: no hace falta leer `req.body` crudo ni
  `@ValidateIf`, y el endpoint sigue siendo un PATCH parcial honesto. Alternativa
  descartada: aceptar `null` explícito con el patrón de body crudo — más código,
  más superficie de error, ninguna capacidad extra para este conjunto de campos.

### Guards y ubicación del endpoint

- **`PATCH :tenantId/config`: `@UseGuards(PersonSessionGuard, TenantScopeGuard,
  OwnerRoleGuard)`, en ese orden exacto.** Copia literal del patrón de
  `AdminPeopleController.createPerson`. El orden importa: `PersonSessionGuard`
  adjunta `request.person`; `TenantScopeGuard` compara `params.tenantId` contra
  `person.tenantId` y tira 403 **sin tocar la DB** (AC-4); `OwnerRoleGuard`
  rechaza `AGENT` con 403 sin mutar nada (AC-2). Se descarta `PersonOrApiKeyGuard`
  (el que usan leads/properties/metrics): la API key del tenant es un secreto
  server-to-server sin rol asociado, y la spec exige que solo un `OWNER` humano
  pueda cambiar la configuración; admitir API key haría que cualquier integración
  con la key pudiera reescribir el saludo del bot.
- **`GET :tenantId/webhook-status`: `@UseGuards(PersonSessionGuard,
  TenantScopeGuard)`, sin `OwnerRoleGuard`.** Mismo criterio que
  `listAssignablePeople`: es lectura y le sirve a los dos roles (AC-9/10/11); el
  403 cross-tenant lo da `TenantScopeGuard` (AC-12).
- **`request.person.tenantId` como fuente autoritativa dentro del handler, no el
  `@Param`.** Igual que `AdminPeopleController`. Aunque `TenantScopeGuard` ya
  garantiza que coinciden, la defensa en profundidad es la convención vigente y
  hace que un futuro descuido en el decorador de guards no se convierta en fuga.
- **Los dos handlers van en el `AdminTenantsController` existente.** El prefijo
  `admin/tenants` ya es suyo, `TenantsAdminService` ya tiene Prisma y
  `ConfigService`, y `AdminModule` ya importa `AuthModule`. Alternativa
  descartada: un `TenantConfigController` nuevo — partiría en dos la superficie de
  un mismo recurso sin ganancia.
- **`AuthModule` debe exportar `OwnerRoleGuard`.** Hoy `exports:` incluye solo
  `PersonSessionGuard` y `TenantScopeGuard`, porque `PersonOrApiKeyGuard` era el
  único consumidor externo. Sin este cambio Nest no puede resolver `OwnerRoleGuard`
  en un controller de `AdminModule`. Alternativa descartada: registrarlo también
  como provider en `AdminModule` (lo que se hizo con `MasterKeyGuard` en sentido
  inverso) — duplicaría la instancia sin necesidad; el guard es stateless y sin
  dependencias, exportarlo es de una línea y sin efecto colateral.

### Service: `updateConfig`

```
updateConfig(tenantId, dto) ->
  1. normaliza: para cada string opcional presente, trim(); vacío -> null
     (botName/botTone quedan fuera: no aceptan vacío, el DTO ya lo rechazó)
  2. arma `data` campo por campo, solo con las claves presentes en el dto
  3. si `data` queda vacío -> no se llama a la DB, se devuelve el estado actual
     (PATCH sin cambios es idempotente y no debe mover `updatedAt`)
  4. prisma.tenant.update({ where: { id: tenantId }, data, select: TENANT_CONFIG_SELECT })
  5. P2025 -> NotFoundException('Tenant no encontrado')  [defensivo: TenantScopeGuard
     ya garantiza que el tenant de la sesión existe]
```

- **Respuesta construida con un `select` whitelist, no con `delete tenant.apiKeyHash`.**
  `TENANT_CONFIG_SELECT` enumera las columnas a devolver. Es fail-closed: si mañana
  se agrega una columna secreta a `Tenant`, no se filtra sola. Con `omit`/`delete`
  sobre el objeto completo, cualquier campo nuevo se expondría por defecto y el bug
  sería silencioso. AC-1.
- **`where: { id: tenantId }` sin filtro extra** — acá `tenantId` *es* la PK; el
  aislamiento lo dan los guards + el uso de `req.person.tenantId`.

### Service: `webhookStatus` — la query exacta

```ts
const [lastEvent, lastLead] = await Promise.all([
  this.prisma.webhookEvent.findFirst({
    where: { tenantId },
    orderBy: { receivedAt: 'desc' },
    select: { receivedAt: true },
  }),
  this.prisma.lead.findFirst({
    where: { tenantId, lastMessageAt: { not: null } },
    orderBy: { lastMessageAt: 'desc' },
    select: { lastMessageAt: true },
  }),
]);

return {
  connected: lastEvent !== null || lastLead !== null,
  lastEventAt: lastEvent?.receivedAt ?? null,
  lastMessageAt: lastLead?.lastMessageAt ?? null,
};
```

- **`findFirst` + `orderBy desc` + `select`, no `aggregate({ _max })`.** Ambos usan
  el índice igual, pero `findFirst` con `select` de una sola columna es un
  index-only scan con `LIMIT 1` y se lee mejor. Sin `include`, sin traer la fila
  completa del lead.
- **El filtro `lastMessageAt: { not: null }` es OBLIGATORIO, no cosmético.** En
  Postgres, `ORDER BY ... DESC` implica `NULLS FIRST`: sin ese filtro, un tenant
  con un lead nunca contactado devolvería la fila con `lastMessageAt` nulo como
  "la más reciente" y el endpoint reportaría `lastMessageAt: null` aun teniendo
  mensajes. El filtro también mantiene el uso del índice `[tenantId, lastMessageAt]`.
- **`connected` es un OR de las dos señales, no solo de `WebhookEvent`.** La purga
  de `MaintenanceProcessor` borra los `WebhookEvent` de más de 30 días: un tenant
  real que estuvo un mes sin tráfico aparecería como "nunca conectado" si
  `connected` dependiera solo de esa tabla. Con el OR, la existencia de leads con
  mensajes lo sostiene en `true`. Efecto secundario correcto: `lastEventAt` puede
  ser `null` con `connected: true`, y la UI debe tolerarlo.
- **Las dos queries en `Promise.all`.** Son independientes; en serie duplican la
  latencia de una pantalla que se refresca.
- **Semántica documentada en la UI, no solo en el código.** `connected` significa
  "vimos tráfico entrante para este tenant", no "el webhook está bien suscripto en
  el WABA". El `WebhookStatusCard` lo dice con esas palabras (decisión 4 de la
  spec); sin ese texto el endpoint genera falsa confianza y el operador da por
  cerrado un onboarding que no lo está.

### Integración de `welcomeIntro` / `handoffIntro` (guardrail Ley 25.326)

La regla estructural, no negociable: **el texto del tenant es un parámetro
*dentro* de una plantilla que arma el backend, nunca la plantilla entera.** La
firma de las funciones no cambia (siguen recibiendo `Tenant`), así que ni
`GreetingHandler` ni `ConversationEngine` se modifican.

```
buildGreetingMessage(tenant):
    intro       = trim(tenant.welcomeIntro) || DEFAULT_INTRO(tenant)   // <- único punto variable
    privacyLine = "_Al continuar aceptás que {tenant.name} ... (Ley 25.326). Escribí BAJA ..._"
    return intro + "\n\n" + OPERATION_QUESTION + "\n\n" + privacyLine   // <- estructura fija

buildHandoffFarewell(tenant):
    intro     = trim(tenant.handoffIntro) || "¡Claro! Te dejo con un asesor de {tenant.name}, te escribe a la brevedad."
    hoursLine = tenant.humanHours ? " Horario de atención: {tenant.humanHours}." : ""
    return intro + hoursLine                                            // <- igual que hoy
```

- **`privacyLine` y `OPERATION_QUESTION` se concatenan fuera del valor
  configurable, en la misma expresión de retorno.** No hay ninguna rama donde el
  `return` no las incluya: es imposible que un valor de `welcomeIntro` (vacío,
  gigante, con markdown, con saltos de línea, conteniendo el propio texto de la
  ley, con caracteres de control) haga desaparecer el aviso, porque el aviso no se
  deriva del input. AC-7 se cumple estructuralmente, no por validación.
  Alternativa descartada: un `welcomeTemplate` con placeholders tipo
  `{privacidad}` que el tenant coloca donde quiera — es exactamente el diseño que
  permite omitir el aviso "por error", y obligaría a validar la presencia del
  placeholder en el DTO (validación burlable con un placeholder escondido en
  medio de texto irrelevante). Se descarta también permitir reemplazar la línea de
  privacidad "por una equivalente aprobada": no hay forma automática de verificar
  equivalencia legal.
- **`trim()` en el punto de lectura, además de la normalización en el PATCH.**
  Defensa en profundidad: hay tenants creados antes de esta migración y podría
  haber escrituras futuras por otra vía (seed, script). Un valor de solo espacios
  guardado en DB no debe producir un saludo que arranque en blanco. Con el trim en
  lectura, AC-6 se cumple aunque la normalización de escritura falle.
- **`DEFAULT_INTRO` se extrae como constante/función exportada y el test la usa
  como referencia.** Así AC-6 ("sin cambios de comportamiento respecto del sistema
  hoy") se verifica contra un valor único y no contra un string copiado en el test.
- **`buildSchedulingHandoffMessage` NO se toca.** La spec acota `handoffIntro` al
  handoff genérico; el mensaje post-interés en una propiedad tiene contenido propio
  (duración de la visita, sin compromiso) que no es una simple frase de
  presentación. Fuera de alcance, explícito.
- **`privacyNoticeSent` (campo existente de `Tenant`, default `true`) queda como
  está: no se expone en el DTO de configuración.** Hoy no lo lee nadie; volverlo
  editable sería darle al tenant un interruptor para apagar el aviso legal, que es
  exactamente lo que AC-7 prohíbe. Se documenta como no editable.

### Frontend: estructura del wizard y relación con la Fase B (V-B)

**Decisión: V-C NO bloquea en V-B. El wizard se construye con componentes propios
mínimos bajo `frontend/src/components/onboarding/`, estilados con clases CSS en
`index.css` y CERO `style={{...}}` inline.**

Justificación y coordinación:

- El plan recomendado del proyecto es A → B → (B2 y C en paralelo): C no depende
  estrictamente de B, y esperar a que la migración completa a Tailwind/shadcn
  termine para poder dar de alta clientes invierte la prioridad comercial (el
  wizard es lo que desbloquea vender; el design system es calidad).
- Lo que el wizard necesita de "componentes base" es un subconjunto trivial:
  inputs de texto, un botón, un contenedor tipo tarjeta, un stepper y un uploader
  de archivo. Nada de eso justifica bloquear en `Modal`/`Toast`/`Table`/`Skeleton`.
- **La restricción real de V-B es su AC-1: cero `style={{...}}` en
  `frontend/src/routes/` y `frontend/src/components/`.** Si V-C mete estilos
  inline "provisorios", deja a V-B con deuda que su alcance declarado (8 rutas
  fijas) no cubre. Por eso los componentes nuevos usan clases CSS desde el día
  uno: si V-B llega después, la migración es mecánica (cambiar `className` por el
  componente `Button`/`Card`/`Input`); si llega antes, el implementer de V-C usa
  directamente los componentes de V-B sin cambiar la estructura.
- **La presentación se concentra en `components/onboarding/`, no en las páginas.**
  Las dos rutas nuevas quedan como orquestadores (estado, llamadas, transiciones);
  toda la pintura vive en los componentes. Eso acota la superficie de migración
  futura a una sola carpeta.
- **Item de coordinación para V-B (no bloqueante para V-C):** V-B declara "no
  agregar páginas ni rutas nuevas" y lista 8 rutas a migrar. Al terminar V-C hay
  10. Hay que sumar `OnboardingWizardPage` y `TenantConfigPage` a la lista de
  migración de V-B (o dejarlo como follow-up explícito de V-B). Se anota acá para
  que no se pierda.

Estructura de los 3 pasos:

- **`OnboardingWizardPage`** mantiene el estado del flujo:
  `{ step, masterKey, tenantId, apiKey, sessionToken, ownerEmail }`. Cada paso es
  reintentable de forma independiente (decisión 1 de la spec): si el CSV falla, no
  se rehace el alta; si `bootstrap-owner` falla, el tenant ya creado se conserva y
  se reintenta solo esa llamada (re-postear el alta daría 409 por
  `slug`/`phoneNumberId` únicos, y la UI debe explicarlo en vez de mostrar un
  error crudo).
- **Paso 1 — `TenantCreateForm`:** campos de `CreateTenantDto` (name, slug,
  phoneNumberId, wabaId?, accessToken, displayPhone?, botName?, botTone?,
  humanHours?, schedulingLink?, alertPhone?, alertsEnabled?, coverageAreas?,
  competitorsToAvoid?) + email y contraseña del OWNER. Dispara, en orden:
  `POST /admin/tenants` → `POST :id/people/bootstrap-owner` → `POST /auth/login`.
  Al terminar muestra `ApiKeyReveal` con la API key y el aviso de que no se vuelve
  a mostrar.
- **Paso 2 — `MetaSetupGuide` + `CsvUploader`:** la guía es copy estático (dónde
  sacar `phoneNumberId`/`wabaId`/token en Meta Business, cómo apuntar el webhook a
  `PUBLIC_BASE_URL/webhook/whatsapp`, dónde va el `META_VERIFY_TOKEN`), sin backend
  nuevo, alineada con `docs/05-OPERACIONES.md`. El uploader postea el archivo a
  `POST :id/properties/import` y renderiza `imported` + la tabla de `errors` fila
  por fila tal como los devuelve `CsvImportService` (AC-15).
- **Paso 3 — `TenantConfigForm` + `ReadinessChecklist`:** el mismo formulario que
  usa `TenantConfigPage` (un solo componente, dos usos — evita que la pantalla de
  edición posterior se desincronice del wizard). El checklist se calcula en el
  cliente a partir de la config devuelta y de `webhook-status`: propiedades
  importadas > 0, `alertPhone` cargado si `alertsEnabled`, `humanHours` cargado, y
  `connected === true`.

**Auth del wizard (decisiones aprobadas 1 y 2 de la spec, aterrizadas):**

- La master key se pide en un campo del propio wizard y **vive solo en memoria de
  React**: no va a `sessionStorage` ni a `localStorage` (a diferencia del token de
  sesión, que sí usa `session-store.ts`). Es el secreto de plataforma completo:
  persistirlo en el navegador es una exposición de otro orden de magnitud que la
  de un token de sesión de un tenant. Costo asumido: refrescar la página en medio
  del wizard obliga a volver a ingresarla y pierde el estado del flujo; aceptable
  para un operador único, y la UI avisa antes de empezar.
- `/onboarding` va **fuera** de `ProtectedRoute`: al iniciar el wizard todavía no
  existe ninguna sesión de persona. `/configuracion` va **dentro** de
  `ProtectedRoute` y solo se muestra a `OWNER` (mismo criterio de visibilidad por
  rol que `PeoplePage`).
- Los pasos 2 y 3 **no** usan la master key ni la API key: usan el token de sesión
  del OWNER recién creado, obtenido con `POST /auth/login` en el paso 1 con las
  credenciales que el propio operador acaba de definir (`BootstrapOwnerDto` exige
  email + password, así que el wizard las conoce). Esto encaja exactamente con los
  guards existentes (el import CSV acepta sesión vía `PersonOrApiKeyGuard`;
  `PATCH config` exige sesión OWNER) sin relajar ninguno. Alternativa descartada:
  agregar `MasterKeyGuard` como alternativa en `PATCH :tenantId/config` — abriría
  un camino de escritura de configuración que esquiva `TenantScopeGuard`, o sea
  exactamente el tipo de bypass cross-tenant que el proyecto clasifica como
  crítico.

**Cambios de infraestructura frontend que el wizard obliga (fáciles de pasar por
alto y bloqueantes):**

- **CORS:** `src/main.ts` declara `allowedHeaders: ['Content-Type',
  'Authorization', 'X-Api-Key']`. Falta `X-Master-Key`: el preflight del paso 1
  falla y AC-13 ("sin intervención fuera del navegador") es inalcanzable. Se
  agrega.
- **`http-client`:** hoy siempre setea `Content-Type: application/json` y hace
  `JSON.stringify(body)`. Para el multipart del CSV hay que permitir
  `body: FormData` → no serializar y **no** setear `Content-Type` (el navegador
  debe poner el `boundary`). Se implementa como una rama dentro de `request()`
  (`body instanceof FormData`), conservando el mapeo de errores tipados que ya
  usan todas las pantallas. Alternativa descartada: un `fetch` suelto en el
  componente — perdería `NetworkError`/`ValidationError`/`onUnauthorized`.
- El header `X-Master-Key` se pasa con la opción `headers` que `RequestOptions` ya
  soporta; no hace falta tocar la firma.

## Riesgos y edge cases

- **[Master key en el navegador]** Un XSS en el panel puede leer la master key
  mientras el wizard está abierto. Mitigación: solo en memoria, solo en la ruta del
  wizard, operado por el dueño de la plataforma (decisión aprobada 1). El follow-up
  correcto —un rol de plataforma con credencial propia y revocable— queda anotado
  en la spec y NO se resuelve acá.
- **[El tenant duplica el aviso legal]** Si escribe su propio texto de Ley 25.326
  en `welcomeIntro`, el saludo lo va a mencionar dos veces. Es feo, no es una
  violación (el aviso está). Detectarlo automáticamente sería frágil (falsos
  positivos/negativos). Mitigación: texto de ayuda bajo el campo aclarando que el
  aviso legal se agrega solo.
- **[`welcomeIntro` que empuja el aviso fuera de la vista previa]** Mitigado por
  `@MaxLength(500)` + contador de caracteres y preview del mensaje final renderizada
  en el formulario (el operador ve exactamente lo que va a recibir el lead, incluida
  la línea legal).
- **[Cambiar `welcomeIntro` no re-saluda]** `greetedAt` impide repetir el saludo:
  los leads ya saludados nunca ven el texto nuevo. Es el comportamiento correcto (no
  spamear), pero confunde al testear. Se documenta en la UI del campo.
- **[`connected` falso negativo]** Tenant real sin tráfico hace más de 30 días y sin
  leads (caso raro: leads suprimidos por derecho de supresión). Devolvería
  `connected: false`. Aceptable dado que el endpoint es explícitamente una señal de
  actividad; la UI no debe decir "mal configurado" sino "todavía no vimos mensajes".
- **[`connected` falso positivo]** Un evento entrante prueba que Meta llega al
  webhook, pero no que el token saliente sea válido: el bot puede recibir y no poder
  responder. El checklist del paso 3 no debe presentar `connected: true` como
  "listo": el criterio de "operativo" incluye haber visto una respuesta saliente. Se
  refleja en el copy.
- **[Índice nuevo sobre tabla de escritura caliente]** `WebhookEvent` recibe un
  INSERT por mensaje entrante y está en el camino crítico del <1s. Un índice
  compuesto extra encarece marginalmente el INSERT; la tabla está acotada por la
  purga. Riesgo bajo, se acepta a cambio de evitar el scan de AC-9.
- **[PATCH concurrente / sin auditoría]** Dos OWNERs editando a la vez: last write
  wins, sin historial (fuera de alcance por spec). Como el PATCH es parcial y por
  campo, el daño real es acotado.
- **[Alta a medias]** Tenant creado y `bootstrap-owner` fallido deja un tenant sin
  OWNER: no se puede completar el wizard con sesión. La UI debe permitir reintentar
  solo ese paso (con la master key aún en memoria) y, si el operador perdió el
  estado, `bootstrap-owner` sigue siendo invocable después con master key para el
  mismo `tenantId`. No se implementa rollback del alta: borrar un tenant es una
  operación destructiva que no existe hoy y no se introduce acá.
- **[Slug/phoneNumberId duplicados]** `create()` ya devuelve 409 con mensaje claro;
  el formulario debe mapearlo a un error de campo, no a un banner genérico
  (`ConflictError` ya está tipado en `http-client`).
- **[Access token en el formulario]** Se envía en claro por HTTPS y el backend lo
  cifra (AC-16, sin cambios). El input debe ser `type="password"`, sin
  autocompletado, y el valor no debe quedar en el estado del wizard después del
  paso 1.
- **[CSV grande]** Sin cambios respecto de hoy (mismo endpoint, mismo límite); la UI
  debe mostrar estado de carga y no permitir doble submit.
- **[`updatedAt` del tenant]** El PATCH lo refresca; nadie depende de él para
  métricas. Un PATCH sin campos no llega a la DB (ver `updateConfig`), así que no lo
  mueve gratis.

## Tests

### Unit — guardrails de Ley 25.326 (AC-5, AC-6, AC-7, AC-8)

`src/conversation/templates.spec.ts` (se extiende el archivo existente):

- `buildGreetingMessage` con `welcomeIntro` configurado → el resultado **contiene**
  el texto de `welcomeIntro` **y** contiene `(Ley 25.326)` y `BAJA` (AC-5).
- `buildGreetingMessage` con `welcomeIntro: null` → resultado **exactamente igual**
  al compuesto con `DEFAULT_INTRO`, verificado contra un tenant fixture (AC-6,
  regresión pura).
- `welcomeIntro` vacío y `welcomeIntro` de solo espacios → mismo resultado que
  `null` (AC-6; cubre la normalización de escritura y el trim de lectura).
- **Test de guardrail parametrizado (AC-7):** un `it.each` con valores adversarios
  —vacío, solo espacios, string de 500 caracteres, texto con muchos saltos de línea,
  texto que ya contiene "Ley 25.326", texto que termina en markdown abierto, texto
  con emojis y caracteres de control— y una única aserción para todos: el mensaje
  resultante contiene la línea de privacidad generada por el backend. Este es el
  test que fija la regla de negocio 5; su nombre debe decirlo explícitamente para
  que nadie lo borre por "redundante".
- `buildHandoffFarewell` con `handoffIntro` + `humanHours` → contiene ambos, con la
  línea de horario después del intro (AC-8); con `handoffIntro` y sin `humanHours` →
  solo el intro; sin `handoffIntro` → texto por defecto actual (regresión).
- `buildSchedulingHandoffMessage` → test de regresión de que `handoffIntro` **no** lo
  afecta.

### E2E — configuración y estado de conexión (AC-1 a AC-4, AC-9 a AC-12)

`test/admin-tenant-config.e2e-spec.ts` (patrón de
`test/auth-people-management.e2e-spec.ts`: crear dos tenants con `X-Master-Key`,
bootstrap de owners, login):

- OWNER hace PATCH con un subconjunto de campos → 200, solo esos cambian, la
  respuesta no trae `accessTokenEnc` ni `apiKeyHash` (AC-1). Se relee de la DB para
  confirmar que el resto quedó intacto.
- AGENT hace PATCH → 403 y el tenant no cambió (AC-2).
- PATCH con `accessToken`, `phoneNumberId`, `wabaId`, `slug`, `apiKeyHash` en el body
  → 200 y los cinco valores intactos en DB; en particular `accessTokenEnc` idéntico
  carácter a carácter (AC-3).
- OWNER del tenant A pega a `:tenantId` de B → 403, config de B intacta (AC-4).
- PATCH con `welcomeIntro` vacío tras haberlo seteado → queda `null` en DB.
- `GET webhook-status` en tenant recién creado → `{ connected: false, lastEventAt:
  null, lastMessageAt: null }` (AC-9).
- Se insertan dos `WebhookEvent` para el tenant → `connected: true` y `lastEventAt`
  igual al más reciente (AC-10).
- Se crean dos leads con distinto `lastMessageAt` y uno con `lastMessageAt` nulo →
  devuelve el máximo, no el nulo (AC-11; cubre el `NULLS FIRST`).
- Tenant A consultando `:tenantId` de B → 403 (AC-12).
- `GET webhook-status` con sesión de AGENT → 200 (verifica que no se coló
  `OwnerRoleGuard`).

### E2E — flujo completo del wizard (AC-13, AC-14, AC-15)

`test/onboarding-wizard.e2e-spec.ts`: un test encadenado que replica exactamente las
llamadas HTTP que hace el navegador, sin tocar la DB salvo para verificar.

1. `POST /admin/tenants` con `X-Master-Key` → 201, guarda `tenantId` y `apiKey`.
2. `POST /admin/tenants/:id/people/bootstrap-owner` con `X-Master-Key` → 201.
3. `POST /auth/login` con esas credenciales → token.
4. `POST /admin/tenants/:id/properties/import` con
   `.attach('file', Buffer, 'inventario.csv')` (patrón de
   `test/admin-properties.e2e-spec.ts`) y un CSV con **filas válidas e inválidas
   mezcladas** → `imported >= 1` y `errors` con número de fila y motivo por cada
   inválida; se verifica en DB que las válidas existen y las inválidas no (AC-15).
5. `PATCH /admin/tenants/:id/config` con el token del OWNER → 200.
6. **`POST /webhook/whatsapp`** con el payload de `test/fixtures/meta/text.json`
   reescrito con el `phoneNumberId` del tenant recién creado, firmado con
   `X-Hub-Signature-256` (helper `sign()` de `test/webhook.e2e-spec.ts`) → 200, y se
   verifica que se creó el `Lead`, se persistió el `Message` IN y se encoló el job,
   igual que para un tenant preexistente (AC-14). El hecho de que los pasos 1-6 sean
   todos HTTP, sin `psql` ni CLI, **es** la verificación de AC-13.
7. Cierre: `GET webhook-status` después del paso 6 → `connected: true` (une el flujo
   con el endpoint nuevo).

### Regresión (AC-16)

Los e2e existentes de `POST /admin/tenants` y `PATCH :tenantId/token`
(`test/admin-properties.e2e-spec.ts`, `test/admin-guard-composite.e2e-spec.ts`) deben
pasar sin modificación. Si alguno requiere cambios, es señal de que se rompió AC-16.

### Frontend

Tests con Vitest + Testing Library junto a cada componente nuevo, siguiendo el patrón
vigente: `TenantConfigForm` (envía solo los campos tocados; vacío limpia),
`CsvUploader` (renderiza errores fila por fila), `WebhookStatusCard` (los tres
estados: nunca conectado / conectado sin eventos recientes / conectado),
`OnboardingWizardPage` (avance de pasos, reintento de un paso fallido sin repetir el
alta, y que la master key nunca se escriba en `sessionStorage`).

## Trazabilidad

- **AC-1** → `UpdateTenantConfigDto` (todos opcionales) + `updateConfig` que arma
  `data` solo con las claves presentes + `TENANT_CONFIG_SELECT` (whitelist de
  columnas, sin `accessTokenEnc`/`apiKeyHash`). E2E de config.
- **AC-2** → `OwnerRoleGuard` tercero en la cadena: 403 antes del handler, sin
  mutación. E2E con sesión AGENT.
- **AC-3** → `ValidationPipe({ whitelist: true })` global elimina las props no
  declaradas en el DTO; el service nunca hace spread del body crudo. Rama "ignorar"
  (200 + valores protegidos intactos). E2E que compara `accessTokenEnc` antes/después.
- **AC-4** → `TenantScopeGuard` compara `params.tenantId` con `person.tenantId` → 403
  sin tocar la DB; además el service usa `req.person.tenantId`. E2E cross-tenant.
- **AC-5** → `buildGreetingMessage` concatena `intro` (= `welcomeIntro`) **y**
  `privacyLine` en el mismo `return`. Unit test.
- **AC-6** → `trim(welcomeIntro) || DEFAULT_INTRO(tenant)`: `null`/vacío/espacios caen
  al texto actual. Unit tests de regresión contra `DEFAULT_INTRO`.
- **AC-7** → `privacyLine` no se deriva del input y no hay rama de `return` que la
  omita; `@MaxLength(500)` evita empujarla fuera de la vista previa;
  `privacyNoticeSent` no se expone como editable. Unit test parametrizado con valores
  adversarios.
- **AC-8** → `buildHandoffFarewell` = `intro` (= `handoffIntro` o default) +
  `hoursLine` calculada por el backend desde `humanHours`. Unit tests.
- **AC-9** → `webhookStatus`: ambas queries devuelven `null` → `{ connected: false,
  lastEventAt: null, lastMessageAt: null }`. E2E con tenant recién creado.
- **AC-10** → `webhookEvent.findFirst({ where: { tenantId }, orderBy: { receivedAt:
  'desc' } })` sobre el índice `[tenantId, receivedAt]` → `connected: true` + fecha
  del más reciente. E2E con dos eventos.
- **AC-11** → `lead.findFirst({ where: { tenantId, lastMessageAt: { not: null } },
  orderBy: { lastMessageAt: 'desc' } })` sobre el índice existente
  `[tenantId, lastMessageAt]`. E2E con leads de distinta fecha + uno nulo.
- **AC-12** → `TenantScopeGuard` en el GET → 403 sin ejecutar ninguna query. E2E.
- **AC-13** → wizard de 3 pasos sobre endpoints HTTP existentes + los dos nuevos, con
  CORS habilitado para `X-Master-Key` y soporte de `FormData` en el cliente.
  Verificado por la cadena completa del e2e de onboarding (todo HTTP, cero DB).
- **AC-14** → paso 6 del e2e: payload firmado contra el `phoneNumberId` del tenant
  nuevo → 200 + `Lead` + `Message` + job encolado. Nada en `src/webhook` cambia; la
  resolución por `phoneNumberId` funciona porque `POST /admin/tenants` ya persiste
  ese campo.
- **AC-15** → `csv-import.service.ts` se reusa sin tocar; el e2e del wizard usa un CSV
  mixto y verifica `imported` + `errors` con fila y motivo, y `CsvUploader` los
  renderiza.
- **AC-16** → `create()` y `updateAccessToken()` no se modifican; los e2e existentes
  de alta y rotación se mantienen verdes sin cambios.

## Aprobaciones pendientes

> Pipeline crítico (aislamiento multi-tenant + guardrail Ley 25.326). Estas cinco
> decisiones requieren visto bueno humano antes de pasar a `task-splitter`.

1. **Índice `@@index([tenantId, receivedAt])` en `WebhookEvent` dentro de la misma
   migración que los dos campos de `Tenant`.** Va más allá del alcance literal de la
   spec ("solo dos campos nuevos"), pero sin él la consulta de estado de un tenant
   recién creado —el caso principal— escanea la tabla entera.
2. **Semántica de borrado por string vacío (vacío → `NULL`) en vez del patrón de body
   crudo de `PatchAssignmentDto`.** Simplifica el endpoint a costa de no poder
   distinguir `null` explícito de vacío; se juzga irrelevante para campos de texto
   libre.
3. **Auth del wizard:** master key solo en memoria (no `sessionStorage`), y pasos 2 y
   3 con token de sesión del OWNER recién creado vía `POST /auth/login` programático,
   en lugar de habilitar `MasterKeyGuard` en `PATCH config`.
4. **Agregar `X-Master-Key` a `allowedHeaders` del CORS en `src/main.ts`.** Es
   requisito para que el alta funcione desde el navegador (AC-13); implica que el
   header queda aceptado desde los orígenes de `CORS_ORIGINS`.
5. **El wizard se construye con componentes propios en
   `frontend/src/components/onboarding/` (clases CSS, sin `style={{}}`), sin bloquear
   en V-B**, y se anota como follow-up de V-B migrar las dos rutas nuevas al design
   system.
