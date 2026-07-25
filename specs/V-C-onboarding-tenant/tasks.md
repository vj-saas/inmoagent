# Tasks V-C: Onboarding de tenant sin tocar código

> Producido por `task-splitter`. Tareas atómicas derivadas de `plan.md`, cada
> una despachable a un implementer. Vive en
> `specs/V-C-onboarding-tenant/tasks.md`.
>
> Nota de clasificación (según CLAUDE.md "Qué es low/medium/high en este
> proyecto" y "Qué se considera crítico"): la migración Prisma es **high**
> por definición explícita ("migraciones Prisma / cambios de schema"), **no**
> crítica (no toca aislamiento ni guardrails). Los dos endpoints nuevos de
> `admin/tenants` (`updateConfig`, `webhookStatus`) quedan en **medium**: son
> CRUD/lectura estándar de `admin`, filtrados por `tenantId` reutilizando la
> cadena de guards `PersonSessionGuard → TenantScopeGuard → OwnerRoleGuard`
> ya vigente — no introducen ninguna resolución de tenant nueva ni query
> cross-tenant, que es lo que el CLAUDE.md marca como disparador de `high`.
> El cambio en `src/conversation/templates.ts` (`buildGreetingMessage`,
> `buildHandoffFarewell`) SÍ es **high y crítico**: CLAUDE.md clasifica
> explícitamente como high los "guardrails de `conversation`" y como crítico
> "el aviso Ley 25.326 en el primer mensaje" — exactamente lo que esta tarea
> toca, aun cuando el cambio de código en sí es chico. Los dos e2e que
> verifican aislamiento cross-tenant (`admin-tenant-config.e2e-spec.ts`) y el
> flujo que atraviesa el webhook real (`onboarding-wizard.e2e-spec.ts`)
> quedan en **high**, mismo criterio que en A.4/B.1: "ante la duda, el nivel
> más alto para la superficie crítica". Frontend sigue la clasificación del
> propio plan (**medium**): son formularios/componentes CRUD estándar sobre
> contratos HTTP ya definidos, sin lógica de negocio nueva del lado cliente.
> Wiring de una línea (exports, CORS) queda en **low** por ser ajuste de
> config sin lógica.

## Tareas

## T1 — Migración Prisma: `welcomeIntro`, `handoffIntro`, índice `WebhookEvent`
- **Dificultad:** high ← migración de schema Prisma, clasificación explícita del CLAUDE.md, no crítica
- **Descripción:** En `prisma/schema.prisma`, agregar a `model Tenant`:
  `welcomeIntro String?`, `handoffIntro String?` (nullable, sin default, sin
  backfill). Agregar a `model WebhookEvent`: `@@index([tenantId,
  receivedAt])` (mantener el `@@index([receivedAt])` existente intacto, es
  el que usa la purga de `MaintenanceProcessor`). Generar y correr
  `npx prisma migrate dev --name
  add_tenant_intro_texts_and_webhook_event_tenant_index`. Verificar que el
  SQL resultante son exactamente tres sentencias (`ALTER TABLE ... ADD
  COLUMN` x2 + `CREATE INDEX`), sin reescritura de tabla. Verificar que
  Prisma Client regenerado tipa `welcomeIntro`/`handoffIntro` como
  `string | null` en el modelo `Tenant`.
- **Valida:** prerrequisito estructural de AC-1, AC-5, AC-6, AC-7, AC-8,
  AC-9, AC-10, AC-11 (ningún AC de negocio se valida directamente acá; se
  verifica por `npx prisma validate` + build limpio + que las tareas
  posteriores compilen y sus tests pasen contra el schema nuevo).
- **Dependencias:** ninguna
- **Paralelizable:** no (bloquea T3, T4, T5, T7)

## T2 — `AuthModule`: exportar `OwnerRoleGuard`
- **Dificultad:** low ← ajuste de config/wiring de una línea, sin lógica nueva
- **Descripción:** En `src/auth/auth.module.ts`, agregar `OwnerRoleGuard` al
  array `exports` (hoy solo exporta `PersonSessionGuard` y
  `TenantScopeGuard`). Sin cambios de comportamiento del guard en sí;
  verificar que `AdminModule` puede inyectarlo sin error de resolución de
  Nest (`npm run build` limpio).
- **Valida:** prerrequisito de T6 (`PATCH :tenantId/config` necesita
  `OwnerRoleGuard` disponible en `AdminModule`). Sin AC propio; se verifica
  por build + que T6/T9 pasen.
- **Dependencias:** ninguna
- **Paralelizable:** sí (con T1, T3-T5, T7, T8, T10)

## T3 — DTO `UpdateTenantConfigDto` + `TENANT_CONFIG_SELECT`
- **Dificultad:** medium ← DTO con `class-validator` + whitelist de columnas, patrón estándar de `admin`
- **Descripción:** Crear `src/admin/tenants/update-tenant-config.dto.ts` con
  los 11 campos editables, todos `@IsOptional()` (validadores calcados de
  `CreateTenantDto`: ver forma exacta en `plan.md` sección "DTO de `PATCH
  /admin/tenants/:tenantId/config`" — `botName`/`botTone` con
  `@MinLength(1)`, el resto sin mínimo; `welcomeIntro` `@MaxLength(500)`,
  `handoffIntro` `@MaxLength(300)`). Crear
  `src/admin/tenants/tenant-config-response.ts` con el tipo
  `TenantConfigResponse` y la constante `TENANT_CONFIG_SELECT` (whitelist
  explícita de columnas de Prisma `select`, sin `accessTokenEnc` ni
  `apiKeyHash`).
- **Valida:** AC-3 (whitelist del DTO descarta `accessToken`,
  `phoneNumberId`, `wabaId`, `slug`, `apiKeyHash` antes del handler) vía
  `test/admin-tenant-config.e2e-spec.ts` una vez integrado en T4/T6; AC-1
  (la whitelist de `TENANT_CONFIG_SELECT` nunca expone secretos) igual.
- **Dependencias:** T1
- **Paralelizable:** sí (con T2, T7, T8)

## T4 — `TenantsAdminService.updateConfig()`
- **Dificultad:** medium ← lógica estándar sobre `admin`/`tenants`, aislamiento vía guards ya vigente (ver nota de clasificación)
- **Descripción:** Implementar `updateConfig(tenantId, dto)` en
  `src/admin/tenants/tenants-admin.service.ts`: normaliza cada string
  opcional presente (`trim()`; vacío → `null`; `botName`/`botTone` quedan
  fuera de la normalización a vacío porque el DTO ya los rechaza vacíos),
  arma `data` campo por campo solo con las claves presentes en el dto (sin
  spread del body crudo), si `data` queda vacío no llama a la DB y devuelve
  el estado actual, `prisma.tenant.update({ where: { id: tenantId }, data,
  select: TENANT_CONFIG_SELECT })`, captura `P2025` →
  `NotFoundException('Tenant no encontrado')`. `create()` y
  `updateAccessToken()` existentes quedan intactos (AC-16).
- **Valida:** AC-1, AC-3 vía `test/admin-tenant-config.e2e-spec.ts` una vez
  wireado en T6.
- **Dependencias:** T1, T3
- **Paralelizable:** sí (con T5)

## T5 — `TenantsAdminService.webhookStatus()`
- **Dificultad:** medium ← lectura filtrada por `tenantId`, sin resolución de tenant nueva (mismo patrón que `AdminLeadsService`)
- **Descripción:** Implementar `webhookStatus(tenantId)` en
  `tenants-admin.service.ts` con la query exacta del plan: `Promise.all` de
  `prisma.webhookEvent.findFirst({ where: { tenantId }, orderBy: {
  receivedAt: 'desc' }, select: { receivedAt: true } })` y
  `prisma.lead.findFirst({ where: { tenantId, lastMessageAt: { not: null } },
  orderBy: { lastMessageAt: 'desc' }, select: { lastMessageAt: true } })`
  (el filtro `not: null` es obligatorio, evita el `NULLS FIRST` de
  Postgres). Devuelve `{ connected: lastEvent !== null || lastLead !== null,
  lastEventAt: lastEvent?.receivedAt ?? null, lastMessageAt:
  lastLead?.lastMessageAt ?? null }`.
- **Valida:** AC-9, AC-10, AC-11 vía `test/admin-tenant-config.e2e-spec.ts`
  una vez wireado en T6.
- **Dependencias:** T1
- **Paralelizable:** sí (con T4)

## T6 — `AdminTenantsController`: wire `PATCH :tenantId/config` + `GET :tenantId/webhook-status`
- **Dificultad:** medium ← controller nuevo endpoint sobre módulo existente, reusa guards ya vigentes, sin resolución de tenant nueva
- **Descripción:** En `src/admin/tenants/admin-tenants.controller.ts`
  agregar `PATCH :tenantId/config` con `@UseGuards(PersonSessionGuard,
  TenantScopeGuard, OwnerRoleGuard)` en ese orden exacto, usando
  `request.person.tenantId` (no el `@Param`) como fuente autoritativa hacia
  el service; y `GET :tenantId/webhook-status` con `@UseGuards
  (PersonSessionGuard, TenantScopeGuard)` sin `OwnerRoleGuard` (accesible por
  `OWNER` y `AGENT`). Los dos handlers existentes (`POST` alta, `PATCH
  :tenantId/token`) quedan intactos. Registrar `OwnerRoleGuard` como
  dependencia inyectable disponible (requiere T2).
- **Valida:** AC-1, AC-2, AC-3, AC-4, AC-9, AC-10, AC-11, AC-12 —
  cableado completo, validado end-to-end en T9.
- **Dependencias:** T2, T4, T5
- **Paralelizable:** no (integra T4 y T5 en el mismo controller/servicio)

## T7 — `templates.ts`: guardrail Ley 25.326 en `welcomeIntro`/`handoffIntro`
- **Dificultad:** high ← guardrail de `conversation` + aviso Ley 25.326 en primer mensaje, ambos clasificados explícitamente en CLAUDE.md ("high" y "crítico" respectivamente)
- **Descripción:** En `src/conversation/templates.ts`, modificar
  `buildGreetingMessage(tenant)`: `intro = trim(tenant.welcomeIntro) ||
  DEFAULT_INTRO(tenant)` (extraer `DEFAULT_INTRO` como constante/función
  exportada), y el `return` concatena SIEMPRE, en la misma expresión,
  `intro + "\n\n" + OPERATION_QUESTION + "\n\n" + privacyLine` — sin
  ninguna rama donde `privacyLine` pueda faltar, sin importar el contenido
  de `welcomeIntro` (vacío, solo espacios, 500 caracteres, con saltos de
  línea, con markdown, con texto que ya mencione "Ley 25.326", con emojis o
  caracteres de control). Modificar `buildHandoffFarewell(tenant)`: `intro =
  trim(tenant.handoffIntro) || <default actual>`, `hoursLine` se sigue
  calculando desde `tenant.humanHours` por el backend, `return = intro +
  hoursLine`. `buildSchedulingHandoffMessage` NO se toca (regresión). Firma
  de ambas funciones sin cambios (siguen recibiendo `Tenant`);
  `GreetingHandler` y `ConversationEngine` no se tocan. Agregar a
  `src/conversation/templates.spec.ts` los bloques de test del plan: saludo
  con `welcomeIntro` configurado (contiene el texto y `(Ley 25.326)` y
  `BAJA`), `welcomeIntro` null/vacío/solo-espacios → igual a `DEFAULT_INTRO`,
  test parametrizado (`it.each`) con los valores adversarios listados →
  todos contienen la línea de privacidad, handoff con/sin `handoffIntro` y
  con/sin `humanHours`, y regresión de `buildSchedulingHandoffMessage` no
  afectado.
- **Valida:** AC-5, AC-6, AC-7, AC-8 vía
  `src/conversation/templates.spec.ts`.
- **Dependencias:** T1
- **Paralelizable:** sí (con T2, T3, T8)

## T8 — CORS: agregar `X-Master-Key` a `allowedHeaders`
- **Dificultad:** low ← ajuste de configuración, sin lógica de negocio
- **Descripción:** En `src/main.ts`, agregar `'X-Master-Key'` al array
  `allowedHeaders` de la configuración de CORS (hoy `['Content-Type',
  'Authorization', 'X-Api-Key']`). Verificar que el preflight `OPTIONS`
  responde con el header incluido para los orígenes de `CORS_ORIGINS`.
- **Valida:** prerrequisito de AC-13 (sin este cambio el paso 1 del wizard
  es inalcanzable desde el navegador); verificado indirectamente en
  `test/onboarding-wizard.e2e-spec.ts` (T19) y explícitamente si el
  implementer agrega un test de preflight CORS — hueco menor, no bloqueante
  (los tests e2e con supertest no pasan por el navegador real, así que este
  cambio no tiene un test automatizado directo; se verifica manualmente o
  con un test de integración de CORS si el implementer lo agrega).
- **Dependencias:** ninguna
- **Paralelizable:** sí (con T1-T7, T10)

## T9 — e2e `admin-tenant-config.e2e-spec.ts`: config + webhook-status + aislamiento
- **Dificultad:** high ← superficie crítica de aislamiento multi-tenant (CLAUDE.md), mismo criterio que A.4/B.1: ante la duda, el nivel más alto
- **Descripción:** Crear `test/admin-tenant-config.e2e-spec.ts` (patrón de
  `test/auth-people-management.e2e-spec.ts`: dos tenants vía
  `X-Master-Key`, bootstrap de owners, login). Casos: OWNER hace PATCH con
  subconjunto de campos → 200, solo esos cambian, respuesta sin
  `accessTokenEnc`/`apiKeyHash`, releído de DB (AC-1); AGENT hace PATCH →
  403 sin cambios (AC-2); PATCH con `accessToken`/`phoneNumberId`/`wabaId`/
  `slug`/`apiKeyHash` en el body → 200 y los cinco valores intactos en DB,
  `accessTokenEnc` idéntico carácter a carácter (AC-3); OWNER de tenant A
  contra `:tenantId` de B → 403, config de B intacta (AC-4); PATCH con
  `welcomeIntro` vacío tras haberlo seteado → `null` en DB; `GET
  webhook-status` en tenant recién creado → `{connected: false,
  lastEventAt: null, lastMessageAt: null}` (AC-9); dos `WebhookEvent`
  insertados → `connected: true` + `lastEventAt` del más reciente (AC-10);
  dos leads con distinto `lastMessageAt` + uno nulo → devuelve el máximo, no
  el nulo (AC-11); tenant A consultando `:tenantId` de B → 403 (AC-12);
  `GET webhook-status` con sesión AGENT → 200 (confirma que no se coló
  `OwnerRoleGuard`).
- **Valida:** AC-1, AC-2, AC-3, AC-4, AC-9, AC-10, AC-11, AC-12 vía
  `test/admin-tenant-config.e2e-spec.ts`.
- **Dependencias:** T6
- **Paralelizable:** sí (con T7 si no se hizo antes; en la práctica T7 ya
  debería estar cerrado)

## T10 — `http-client.ts`: soporte de `FormData`
- **Dificultad:** medium ← cambio de plumbing compartido por todas las pantallas, riesgo de regresión si rompe el mapeo de errores tipados
- **Descripción:** En `frontend/src/api/http-client.ts`, agregar una rama en
  `request()`: si `body instanceof FormData`, no serializar con
  `JSON.stringify` ni setear `Content-Type` (el navegador pone el
  `boundary` solo); si no, mantiene el comportamiento actual
  (`JSON.stringify` + `Content-Type: application/json`). Conservar el
  mapeo de errores tipados (`NetworkError`/`ValidationError`/
  `onUnauthorized`) sin cambios para ambas ramas. Agregar test que verifica
  que un `body: FormData` no setea `Content-Type` y que un body plano sigue
  serializando como antes (regresión).
- **Valida:** prerrequisito de AC-15 (el uploader de CSV del wizard no
  funciona sin esto). Test unitario del propio archivo (`http-client.test.ts`
  o equivalente, patrón vigente).
- **Dependencias:** ninguna
- **Paralelizable:** sí (con T1-T9)

## T11 — `endpoints.ts`: funciones de API del wizard
- **Dificultad:** medium ← wiring de funciones de API sobre contratos ya definidos
- **Descripción:** En `frontend/src/api/endpoints.ts`, agregar
  `createTenant`, `bootstrapOwner`, `importPropertiesCsv` (usa `FormData`,
  requiere T10), `updateTenantConfig`, `getWebhookStatus`. Las tres
  primeras llaman a endpoints ya existentes (`POST /admin/tenants`, `POST
  :id/people/bootstrap-owner`, `POST :id/properties/import`); las dos
  últimas a los endpoints nuevos de T6. `createTenant`/`bootstrapOwner`
  reciben `X-Master-Key` por header; el resto, el token de sesión ya
  manejado por `http-client`.
- **Valida:** prerrequisito de AC-13, AC-15; validado end-to-end en T19.
- **Dependencias:** T6, T10
- **Paralelizable:** sí (con T12-T16 una vez cerrada esta)

## T12 — Componentes del paso 1: `WizardStepper`, `TenantCreateForm`, `ApiKeyReveal`
- **Dificultad:** medium ← formularios/CRUD estándar del lado cliente, sin lógica de negocio nueva
- **Descripción:** Crear `frontend/src/components/onboarding/WizardStepper.tsx`
  (indicador de paso 1/2/3, sin `style={{}}` inline, clases en `index.css`).
  Crear `TenantCreateForm.tsx` con los campos de `CreateTenantDto`
  (`name`, `slug`, `phoneNumberId`, `wabaId?`, `accessToken` como
  `type="password"` sin autocompletado, `displayPhone?`, `botName?`,
  `botTone?`, `humanHours?`, `schedulingLink?`, `alertPhone?`,
  `alertsEnabled?`, `coverageAreas?`, `competitorsToAvoid?`) más email y
  contraseña del OWNER; mapea `ConflictError` (slug/phoneNumberId
  duplicados) a error de campo, no a banner genérico. Crear
  `ApiKeyReveal.tsx` que muestra la API key generada con aviso de que no se
  vuelve a mostrar y botón de copiar. Tests `.test.tsx` junto a cada
  componente (patrón vigente).
- **Valida:** prerrequisito de AC-13; comportamiento verificado en el e2e
  de wizard (T19, a nivel HTTP) y en tests de componente propios
  (render, validación de campos, mapeo de `ConflictError`).
- **Dependencias:** T11
- **Paralelizable:** sí (con T13, T14, T15, T16)

## T13 — Componentes del paso 2: `MetaSetupGuide`, `CsvUploader`
- **Dificultad:** medium
- **Descripción:** Crear `MetaSetupGuide.tsx` (copy estático alineado con
  `docs/05-OPERACIONES.md`: dónde sacar `phoneNumberId`/`wabaId`/token en
  Meta Business, cómo apuntar el webhook a `PUBLIC_BASE_URL/webhook/whatsapp`,
  dónde va `META_VERIFY_TOKEN`; cero backend). Crear `CsvUploader.tsx` que
  postea el archivo a `importPropertiesCsv` y renderiza `imported` + la
  tabla de `errors` fila por fila tal como los devuelve `CsvImportService`;
  estado de carga, sin permitir doble submit. Test `.test.tsx` que verifica
  el render de errores fila por fila con una respuesta mixta simulada.
- **Valida:** AC-15 (verificado completo en T19; el componente por sí
  mismo se valida con su test unitario de render).
- **Dependencias:** T11
- **Paralelizable:** sí (con T12, T14, T15, T16)

## T14 — `TenantConfigForm` + `ReadinessChecklist` (paso 3, reusado)
- **Dificultad:** medium
- **Descripción:** Crear `TenantConfigForm.tsx`: un único componente
  reusado por el wizard (paso 3) y por `TenantConfigPage`, con los 11
  campos de `UpdateTenantConfigDto`; envía solo los campos tocados (PATCH
  parcial), vacío limpia el campo (semántica de borrado del backend).
  Incluye contador de caracteres y vista previa del mensaje final de
  `welcomeIntro` (intro + pregunta de operación + línea de privacidad) y de
  `handoffIntro` (+ línea de horario), con texto de ayuda aclarando que el
  aviso legal se agrega solo. Crear `ReadinessChecklist.tsx`: calculado en
  cliente a partir de la config devuelta y de `webhook-status`
  (propiedades importadas > 0, `alertPhone` cargado si `alertsEnabled`,
  `humanHours` cargado, `connected === true`). Test `.test.tsx` de
  `TenantConfigForm` que verifica que solo se envían los campos tocados y
  que vacío limpia.
- **Valida:** prerrequisito de AC-13; el `PATCH` real se valida en T9 (a
  nivel backend) y en T19 (a nivel wizard completo); el componente se
  valida con su test unitario propio.
- **Dependencias:** T11
- **Paralelizable:** sí (con T12, T13, T15, T16)

## T15 — `WebhookStatusCard`
- **Dificultad:** medium
- **Descripción:** Crear `WebhookStatusCard.tsx`: consume `getWebhookStatus`
  y muestra los tres estados (nunca conectado / conectado sin eventos
  recientes / conectado) con el texto explícito de que `connected`
  significa "vimos tráfico entrante", no "el webhook está bien suscripto en
  el WABA" (decisión 4 de la spec). Test `.test.tsx` que cubre los tres
  estados con datos simulados.
- **Valida:** prerrequisito de AC-9, AC-10, AC-11 en su representación
  visual; los valores en sí ya están validados por T9. Test unitario propio
  de los tres estados de UI.
- **Dependencias:** T11
- **Paralelizable:** sí (con T12, T13, T14, T16)

## T16 — `index.css`: clases del wizard
- **Dificultad:** low ← estilo/formato, sin lógica
- **Descripción:** Agregar a `frontend/src/index.css` las clases usadas por
  los componentes de `components/onboarding/` (stepper, tarjeta, form,
  uploader, reveal de API key, checklist), de forma que ningún componente
  nuevo use `style={{}}` inline (alineado con la futura migración de V-B).
- **Valida:** sin AC propio; requisito de estilo cross-cutting. Se verifica
  por revisión de que T12-T15 no introducen `style={{}}`.
- **Dependencias:** ninguna
- **Paralelizable:** sí (con cualquier tarea de frontend)

## T17 — `OnboardingWizardPage`
- **Dificultad:** medium
- **Descripción:** Crear `frontend/src/routes/OnboardingWizardPage.tsx`:
  mantiene el estado `{ step, masterKey, tenantId, apiKey, sessionToken,
  ownerEmail }`. La master key vive **solo en memoria de React** (nunca en
  `sessionStorage`/`localStorage`). Orquesta, en orden: `createTenant` →
  `bootstrapOwner` → `POST /auth/login` (guarda `sessionToken` en memoria,
  NO en `session-store.ts` hasta que el login sea exitoso) → muestra
  `ApiKeyReveal` → paso 2 (`MetaSetupGuide` + `CsvUploader`, usa
  `sessionToken`, no la master key) → paso 3 (`TenantConfigForm` +
  `ReadinessChecklist` + `WebhookStatusCard`). Cada paso es reintentable de
  forma independiente: si `bootstrapOwner` falla, el `tenantId` ya creado
  se conserva y solo se reintenta esa llamada (con la master key aún en
  memoria), sin repetir `createTenant`. El valor de `accessToken` no debe
  quedar en el estado del wizard después del paso 1. Test `.test.tsx` que
  verifica: avance de pasos, reintento de un paso fallido sin repetir el
  alta, y que la master key nunca se escriba en `sessionStorage` (espiar
  `sessionStorage.setItem` durante todo el flujo simulado).
- **Valida:** AC-13 (el flujo completo, sin intervención fuera del
  navegador) — verificado a nivel componente por el test propio y a nivel
  HTTP real por `test/onboarding-wizard.e2e-spec.ts` (T19, que replica las
  mismas llamadas que hace esta página).
- **Dependencias:** T12, T13, T14, T15, T16
- **Paralelizable:** no (integra los componentes de los pasos 1-3)

## T18 — `TenantConfigPage` + routing en `App.tsx`
- **Dificultad:** medium
- **Descripción:** Crear `frontend/src/routes/TenantConfigPage.tsx`: reusa
  `TenantConfigForm` + `WebhookStatusCard` para edición posterior
  (independiente del wizard). En `frontend/src/App.tsx`: agregar
  `/onboarding` **fuera** de `ProtectedRoute` (no existe sesión de persona
  al iniciar el wizard) y `/configuracion` **dentro** de `ProtectedRoute`,
  visible solo a `OWNER` (mismo criterio de visibilidad por rol que
  `PeoplePage`).
- **Valida:** prerrequisito de AC-13 (ruta accesible sin sesión previa) y de
  la restricción de rol de `/configuracion` (mismo patrón que `PeoplePage`,
  sin AC numerado propio en esta spec — se valida por test de routing si el
  implementer lo agrega, o manualmente).
- **Dependencias:** T14, T15, T17
- **Paralelizable:** no (depende del wizard y de los componentes de config)

## T19 — e2e `onboarding-wizard.e2e-spec.ts`: flujo completo + webhook
- **Dificultad:** high ← atraviesa el webhook real (idempotencia, encolado, resolución de tenant), superficie crítica según CLAUDE.md
- **Descripción:** Crear `test/onboarding-wizard.e2e-spec.ts`, un test
  encadenado que replica exactamente las llamadas HTTP del navegador, sin
  `psql`/CLI: (1) `POST /admin/tenants` con `X-Master-Key` → 201, guarda
  `tenantId`/`apiKey`; (2) `POST :id/people/bootstrap-owner` con
  `X-Master-Key` → 201; (3) `POST /auth/login` con esas credenciales →
  token; (4) `POST :id/properties/import` con un CSV con filas válidas e
  inválidas mezcladas (`.attach`, patrón de
  `test/admin-properties.e2e-spec.ts`) → `imported >= 1` y `errors` con
  número de fila y motivo por cada inválida, verificado en DB que las
  válidas existen y las inválidas no (AC-15); (5) `PATCH :id/config` con el
  token del OWNER → 200; (6) `POST /webhook/whatsapp` con el payload de
  `test/fixtures/meta/text.json` reescrito con el `phoneNumberId` del
  tenant nuevo, firmado con `X-Hub-Signature-256` (helper `sign()` de
  `test/webhook.e2e-spec.ts`) → 200, se verifica que se creó el `Lead`, se
  persistió el `Message` IN y se encoló el job, igual que para un tenant
  preexistente (AC-14); (7) `GET webhook-status` después del paso 6 →
  `connected: true`. El hecho de que los pasos 1-7 sean todos HTTP, sin
  `psql` ni CLI, es la verificación de AC-13.
- **Valida:** AC-13, AC-14, AC-15 vía `test/onboarding-wizard.e2e-spec.ts`.
- **Dependencias:** T6, T8
- **Paralelizable:** sí (con T9, una vez ambas dependencias resueltas)

## T20 — Regresión AC-16: alta y rotación de token sin cambios
- **Dificultad:** medium ← test de verificación sin cambios de código de producción en los endpoints existentes
- **Descripción:** Correr sin modificar `test/admin-properties.e2e-spec.ts`
  y `test/admin-guard-composite.e2e-spec.ts` (cubren `POST
  /admin/tenants` y `PATCH :tenantId/token`) contra el código resultante de
  T1-T19. Si alguno requiere cambios para pasar, es señal de que se rompió
  AC-16 y hay que revertir el cambio que lo causó antes de continuar. No se
  escribe test nuevo; se documenta la corrida verde como evidencia.
- **Valida:** AC-16 vía los e2e existentes sin modificar.
- **Dependencias:** T6
- **Paralelizable:** sí (con T9, T19)

## T21 — Nota de coordinación con V-B (no bloqueante)
- **Dificultad:** low ← anotación de coordinación entre fases, sin código
- **Descripción:** Dejar registrado (en el PR o en un comentario de
  seguimiento del proyecto) que V-B declaró "no agregar páginas ni rutas
  nuevas" listando 8 rutas a migrar al design system, y que al terminar V-C
  hay 10: sumar `OnboardingWizardPage` y `TenantConfigPage` a la lista de
  migración pendiente de V-B, o dejarlo como follow-up explícito de esa
  fase. No requiere cambio de código en V-C.
- **Valida:** ninguno — es una nota de coordinación entre fases, no valida
  ningún AC de esta spec. Se deja explícito como excepción a la regla
  general (no hay hueco de cobertura: ningún AC de V-C depende de esta
  tarea).
- **Dependencias:** ninguna
- **Paralelizable:** sí

## Orden de ejecución sugerido

> Lo usa `task-router` para despachar.

- **Grupo 1 (paralelo, sin dependencias):** T1, T2, T8, T10, T16, T21
- **Grupo 2 (paralelo, depende de Grupo 1):** T3, T5, T7 (dependen de T1);
  T4 (depende de T1 y T3, puede arrancar cuando T3 cierre dentro de este
  mismo grupo)
- **Grupo 3 (secuencial, depende de Grupo 2):** T6 (depende de T2, T4, T5)
- **Grupo 4 (paralelo, depende de Grupo 3):** T9, T19 (T19 también depende
  de T8, ya resuelto en Grupo 1), T20, T11 (depende de T6 y T10)
- **Grupo 5 (paralelo, depende de T11):** T12, T13, T14, T15
- **Grupo 6 (secuencial, depende de Grupo 5):** T17 (integra T12-T16)
- **Grupo 7 (secuencial, depende de T17 y de T14/T15):** T18

Nota: T7 (guardrail Ley 25.326) no bloquea el resto del backend admin (T3-T6)
más allá de compartir T1 como prerrequisito de schema; puede resolverse en
paralelo con el Grupo 2 completo. Dado que toca una superficie crítica, se
recomienda que lo resuelva el mismo implementer que ya conoce
`src/conversation/` y que su merge se revise antes que el de T4-T6 para
evitar conflictos triviales en el mismo módulo (`conversation` vs `admin`
son carpetas distintas, así que el riesgo real es de revisión, no de merge).

## Cobertura de criterios

- AC-1 → T3, T4, T6, T9 ✓
- AC-2 → T6, T9 ✓
- AC-3 → T3, T4, T9 ✓
- AC-4 → T6, T9 ✓
- AC-5 → T7 ✓
- AC-6 → T7 ✓
- AC-7 → T7 ✓
- AC-8 → T7 ✓
- AC-9 → T5, T6, T9 ✓
- AC-10 → T5, T6, T9 ✓
- AC-11 → T5, T6, T9 ✓
- AC-12 → T6, T9 ✓
- AC-13 → T8, T11-T18, T19 ✓
- AC-14 → T19 ✓
- AC-15 → T10, T13, T19 ✓
- AC-16 → T20 ✓

Sin huecos: los 16 AC de la spec tienen al menos una tarea que los valida.
Única tarea sin AC asociado es T21, explícitamente marcada como nota de
coordinación entre fases (no código de producción de esta spec), y T16/T18
tienen validación indirecta (estilo cross-cutting y routing) documentada
como tal en su propia sección — no se considera hueco de cobertura de
negocio.
