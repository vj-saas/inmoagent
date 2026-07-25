# Spec V-C: Onboarding de tenant sin tocar código

## Contexto

Hoy dar de alta una inmobiliaria nueva requiere ejecutar `POST /admin/tenants`
a mano (`src/admin/tenants/admin-tenants.controller.ts`), protegido solo por
`MasterKeyGuard` (header `X-Master-Key`, el secreto de plataforma completo).
No hay ningún wizard, no hay pantalla para editar la configuración del bot
después del alta (`alertPhone`, `humanHours`, mensaje de bienvenida, etc.), y
no hay ninguna forma de ver, desde el navegador, si el número de WhatsApp de
un tenant está efectivamente conectado y recibiendo mensajes. El import CSV
de propiedades (`POST admin/tenants/:tenantId/properties/import`, ya
implementado en `src/admin/properties/csv-import.service.ts`) sí funciona de
punta a punta y se reusa sin cambios.

Esto bloquea vender el producto en serie: cada alta de cliente requiere
intervención manual de quien tiene acceso a la infraestructura (`psql` /
Railway CLI / conocimiento del schema), como documenta el runbook actual en
`docs/05-OPERACIONES.md` §3. El objetivo de esta fase es que un comercial sin
conocimientos técnicos pueda dar de alta una inmobiliaria, cargar su
inventario inicial y dejarla operativa, solo desde el navegador.

### Qué ya existe y se reusa sin cambios

- `POST /admin/tenants` (creación del tenant, cifra el access token, genera
  API key).
- `PATCH /admin/tenants/:tenantId/token` (rotación de access token de Meta).
- `POST /admin/tenants/:tenantId/properties/import` (import CSV por
  `external_ref`, ya con reporte de errores fila por fila).
- `POST /admin/tenants/:tenantId/people/bootstrap-owner` (creación del primer
  usuario `OWNER` del panel, detrás de `MasterKeyGuard`).
- El patrón de guards `PersonSessionGuard → TenantScopeGuard → OwnerRoleGuard`
  usado en `src/auth/admin-people.controller.ts` para operaciones sensibles
  restringidas a `OWNER` dentro del propio tenant.

### Decisiones de modelado (resueltas en esta spec)

**1. El "wizard" es una composición de pantallas sobre endpoints existentes y
dos endpoints nuevos, no un endpoint monolítico nuevo.**

No hace falta (ni conviene) un único endpoint "crear tenant completo": el
wizard del frontend encadena en pasos separados `POST /admin/tenants` (alta),
`POST /admin/tenants/:tenantId/properties/import` (inventario inicial, con la
guía de Meta Business como contenido estático del paso 2, sin backend nuevo)
y el nuevo `PATCH /admin/tenants/:tenantId/config` (paso 3). Mantener los
pasos como llamadas independientes permite reintentar un paso que falla (ej.
CSV con errores) sin repetir el alta ni perder la API key ya generada.

**2. Nuevo endpoint `PATCH /admin/tenants/:tenantId/config` para la
configuración editable post-alta.**

Reemplaza la necesidad de re-ejecutar `POST /admin/tenants` o tocar la DB para
ajustar configuración después del alta. Campos editables (ya existentes en el
modelo `Tenant`, sin migración):
`alertPhone`, `alertsEnabled`, `humanHours`, `botName`, `botTone`,
`schedulingLink`, `coverageAreas`, `competitorsToAvoid`, `displayPhone`.

Explícitamente **NO** editables desde este endpoint (siguen teniendo su propio
camino, por ser credenciales/identidad de ruteo):
- `accessToken`/`accessTokenEnc` → sigue siendo exclusivo de `PATCH
  :tenantId/token`.
- `phoneNumberId`, `wabaId`, `slug` → identifican el ruteo del webhook
  (`TenantsService.findByPhoneNumberId`) y la clave pública del tenant; no se
  contempla su edición en esta spec (cambiar un `phoneNumberId` de un tenant
  ya operativo es, en la práctica, dar de baja un número y alta de otro; fuera
  de alcance).
- `apiKeyHash` → no tiene endpoint de edición directa en ningún módulo
  existente, se mantiene así.

Protegido con el mismo patrón que `AdminPeopleController`: `PersonSessionGuard
→ TenantScopeGuard → OwnerRoleGuard` (solo `OWNER` del propio tenant puede
tocar esta configuración; `AGENT` no).

**3. "Mensaje de bienvenida" y "template de handoff" configurables requieren
dos campos nuevos (migración), con un guardrail no negociable: el tenant NUNCA
puede quitar el aviso Ley 25.326.**

Hoy `buildGreetingMessage`/`buildHandoffFarewell` (`src/llm/prompts.ts`) son
funciones deterministas fijas; no hay ningún campo de texto libre persistido
para ninguno de los dos. Para cumplir el pedido de "mensaje de bienvenida" y
"template de handoff" configurables sin violar la regla de negocio 5 de
`CLAUDE.md` (aviso de Ley 25.326 obligatorio en el primer mensaje), se agregan
dos campos opcionales nuevos a `Tenant`:
- `welcomeIntro` (`String?`): reemplaza solo la primera frase del saludo (el
  "¡Hola! 👋 Soy {botName}..."); el aviso de Ley 25.326 y la pregunta de
  operación siguen siendo agregados por el backend siempre, sin importar el
  contenido de `welcomeIntro` — no son parte del campo editable.
- `handoffIntro` (`String?`): reemplaza solo la frase introductoria del
  handoff ("¡Claro! Te dejo con un asesor de..."); la línea de `humanHours` se
  sigue agregando automáticamente por el backend igual que hoy, no es parte
  del texto libre.

Si cualquiera de los dos campos es `null`/vacío, se usa el texto por defecto
actual (comportamiento sin cambios para tenants que no lo configuran). Estos
dos campos se editan también vía `PATCH /admin/tenants/:tenantId/config`.

**4. "Estado de conexión de WhatsApp" es un proxy de actividad, no un flag de
verificación real.**

La verificación GET del webhook (`WebhookController.verify`) es global a nivel
aplicación (un solo `META_VERIFY_TOKEN`, sin `tenantId` en el query de Meta);
no existe ni puede existir de forma simple un "verificado sí/no" por tenant en
ese sentido estricto. Por eso el nuevo endpoint `GET
/admin/tenants/:tenantId/webhook-status` define "conectado" operativamente
como: **el backend recibió al menos un evento de webhook para el
`phoneNumberId` de este tenant** (`WebhookEvent` con `tenantId` resuelto, o
`Message` de dirección `IN` para ese tenant), y devuelve:
- `connected: boolean` — `true` si existe al menos un `WebhookEvent`/`Message
  IN` para el tenant.
- `lastEventAt: Date | null` — fecha del último evento de webhook recibido
  (cualquier `change`, incluso sin mensaje persistible).
- `lastMessageAt: Date | null` — se resuelve con `MAX(Lead.lastMessageAt)`
  del tenant (ya indexado por `@@index([tenantId, lastMessageAt])`, sin
  necesidad de migración ni de nuevo índice).

No se pretende verificar contra la API de Meta si el webhook está realmente
suscripto en el WABA del cliente (eso requeriría credenciales adicionales de
consulta y queda fuera de alcance); es una señal de actividad observada desde
nuestro propio lado, documentada como tal en la UI para no generar falsa
confianza ("conectado" = "vimos tráfico", no "está bien configurado en Meta").

**5. Aislamiento multi-tenant.**

`PATCH :tenantId/config` y `GET :tenantId/webhook-status` cuelgan de
`admin/tenants/:tenantId/...` y usan el mismo patrón de guards ya vigente en
`admin/tenants/:tenantId/people` (`PersonSessionGuard`, `TenantScopeGuard`,
`OwnerRoleGuard` para `config`; `PersonSessionGuard` + `TenantScopeGuard` para
`webhook-status`, que es de lectura y puede ser accedido tanto por `OWNER`
como por `AGENT`, igual criterio que `listAssignablePeople`). Ninguno de los
dos resuelve datos de un tenant distinto al de la sesión/API key; ambos son
críticos según `CLAUDE.md` §"Qué se considera crítico" (cualquier lógica que
resuelva o pueda filtrar datos entre tenants) y deben preservar el patrón ya
unificado en el resto del módulo admin (`TenantScopeGuard` + filtro por
`tenantId` de sesión en el servicio, no por el `:tenantId` de la URL sin
verificar).

La creación del tenant (`POST /admin/tenants`) en sí no cruza tenants (no
existe `tenantId` todavía al momento de crearlo) y sigue detrás de
`MasterKeyGuard`, sin cambios — ver pregunta abierta más abajo sobre quién
opera ese paso desde el wizard.

## Alcance

- **Backend — migración de schema**:
  - Agregar a `Tenant`: `welcomeIntro` (`String?`), `handoffIntro`
    (`String?`).

- **Backend — endpoint nuevo de configuración**:
  - `PATCH /admin/tenants/:tenantId/config` — actualiza los campos listados
    en la Decisión 2 y 3 (`alertPhone`, `alertsEnabled`, `humanHours`,
    `botName`, `botTone`, `schedulingLink`, `coverageAreas`,
    `competitorsToAvoid`, `displayPhone`, `welcomeIntro`, `handoffIntro`),
    todos opcionales en el body (solo se actualizan los enviados). Protegido
    por `PersonSessionGuard → TenantScopeGuard → OwnerRoleGuard`. Devuelve el
    `Tenant` actualizado (sin exponer `accessTokenEnc`/`apiKeyHash`).

- **Backend — endpoint nuevo de estado de conexión**:
  - `GET /admin/tenants/:tenantId/webhook-status` — devuelve `{ connected,
    lastEventAt, lastMessageAt }` según la Decisión 4. Protegido por
    `PersonSessionGuard → TenantScopeGuard` (ambos roles).

- **Frontend — wizard de alta** (nueva página/flujo en el panel admin):
  - Paso 1: formulario con los campos de `CreateTenantDto` (datos de la
    inmobiliaria, `phoneNumberId`, `accessToken`, etc.) → `POST
    /admin/tenants`. Muestra y permite copiar la API key generada (se avisa
    que no se vuelve a mostrar, igual que hoy).
  - Paso 2: guía estática paso a paso (copy, sin lógica nueva) de cómo obtener
    `phoneNumberId`/`wabaId`/token en Meta Business, y un uploader de CSV que
    llama a `POST /admin/tenants/:tenantId/properties/import` ya existente,
    mostrando el resultado (`imported`/`errors` por fila).
  - Paso 3: formulario de configuración (`PATCH
    /admin/tenants/:tenantId/config`) con los mismos campos del punto
    anterior, más un resumen de "qué falta" antes de considerar al tenant
    operativo.

- **Frontend — pantalla de estado de conexión**: consume `GET
  :tenantId/webhook-status`, muestra `connected` (con aclaración explícita de
  que es una señal de actividad, no una verificación de configuración en
  Meta) y las dos fechas.

- **Frontend — página de configuración por tenant** (independiente del
  wizard, para volver a editar después): mismo formulario del paso 3, editable
  en cualquier momento vía `PATCH :tenantId/config`.

## Fuera de alcance

- Cualquier integración real con la API de Graph de Meta para verificar la
  suscripción del webhook en el WABA del cliente (la Decisión 4 usa solo señal
  interna).
- Edición de `phoneNumberId`, `wabaId`, `slug` de un tenant existente
  (migrar un número a otro tenant es, en efecto, dar de baja y alta de nuevo).
- Edición de `accessToken` desde el endpoint de configuración (sigue siendo
  exclusivo de `PATCH :tenantId/token`, sin cambios).
- Rediseño del import CSV (`csv-import.service.ts` se reusa tal cual, sin
  tocar su lógica de parsing/upsert).
- Refresh tokens / expiración de sesión, monitoreo de tenants sin actividad,
  backups, rate limiting por tenant (todo eso es Fase D — Hardening, no esta
  spec).
- Landing, precios, términos legales (Fase E).
- Reasignación de personas u operaciones de `admin/tenants/:tenantId/people`
  (ya existen, sin cambios).
- Historial de cambios de configuración (quién cambió qué y cuándo): el
  `PATCH :tenantId/config` sobrescribe sin dejar auditoría explícita en esta
  spec; si hace falta trazabilidad, es un follow-up.

## Criterios de aceptación (EARS)

**AC-1.** WHEN una persona con sesión válida y rol `OWNER` invoca `PATCH
:tenantId/config` con uno o más de los campos editables para su propio
tenant THE SYSTEM SHALL actualizar únicamente los campos enviados y devolver
el `Tenant` actualizado sin exponer `accessTokenEnc` ni `apiKeyHash`.

**AC-2.** IF una persona con rol `AGENT` invoca `PATCH :tenantId/config`
THEN THE SYSTEM SHALL rechazar la petición (403) sin modificar la
configuración del tenant.

**AC-3.** IF se invoca `PATCH :tenantId/config` con un campo no editable
(`accessToken`, `phoneNumberId`, `wabaId`, `slug`, `apiKeyHash`) en el body
THEN THE SYSTEM SHALL ignorar o rechazar ese campo (400 si el DTO lo
prohíbe explícitamente) sin modificar los valores protegidos.

**AC-4.** WHEN una persona de un tenant A invoca `PATCH :tenantId/config`
con el `:tenantId` de un tenant B THE SYSTEM SHALL rechazar la petición (403)
sin modificar la configuración de B, preservando el aislamiento multi-tenant.

**AC-5.** WHEN `welcomeIntro` está configurado para un tenant y ese tenant
recibe su primer mensaje de un lead nuevo THE SYSTEM SHALL enviar un saludo
que incluya el texto de `welcomeIntro` Y, en el mismo mensaje o inmediatamente
a continuación, el aviso de tratamiento de datos (Ley 25.326) sin
excepción.

**AC-6.** WHEN `welcomeIntro` no está configurado (`null` o vacío) THE
SYSTEM SHALL enviar el saludo con el texto por defecto actual, sin cambios de
comportamiento respecto del sistema hoy.

**AC-7.** THE SYSTEM SHALL NOT permitir, bajo ningún valor de `welcomeIntro`
configurado por el tenant, que el primer mensaje al lead omita el aviso de
Ley 25.326 (el backend lo agrega siempre, independientemente del contenido
configurado).

**AC-8.** WHEN `handoffIntro` está configurado para un tenant y ocurre un
handoff a humano para un lead de ese tenant THE SYSTEM SHALL enviar un
mensaje de despedida que incluya el texto de `handoffIntro` seguido de la
línea de horario (`humanHours`) si está configurado, igual que el
comportamiento actual para esa parte.

**AC-9.** WHEN una persona con sesión válida (`OWNER` o `AGENT`) invoca `GET
:tenantId/webhook-status` para su propio tenant y ese tenant nunca recibió un
evento de webhook THE SYSTEM SHALL devolver `connected: false`,
`lastEventAt: null`, `lastMessageAt: null`.

**AC-10.** WHEN el tenant recibió al menos un evento de webhook THE SYSTEM
SHALL devolver `connected: true` junto con `lastEventAt` igual a la fecha del
evento más reciente.

**AC-11.** WHEN el tenant tiene al menos un lead con mensajes THE SYSTEM
SHALL devolver `lastMessageAt` igual al valor más reciente de
`Lead.lastMessageAt` de ese tenant.

**AC-12.** WHEN una persona de un tenant A invoca `GET :tenantId/webhook-status`
con el `:tenantId` de un tenant B THE SYSTEM SHALL rechazar la petición (403)
sin devolver datos de actividad de B.

**AC-13.** WHEN se completa el flujo de wizard (alta de tenant vía `POST
/admin/tenants`, import de al menos una propiedad válida vía `POST
:tenantId/properties/import`, y configuración vía `PATCH :tenantId/config`)
THE SYSTEM SHALL dejar al tenant en condición de responder al webhook sin
ninguna intervención adicional fuera del navegador (sin `psql`, sin Railway
CLI).

**AC-14.** WHEN, inmediatamente después de completar el wizard, se envía al
endpoint `POST /webhook/whatsapp` un payload de Meta válido y firmado
correspondiente al `phoneNumberId` de ese tenant recién creado THE SYSTEM
SHALL responder 200 y procesar el mensaje (creación de `Lead`, persistencia
de `Message`, encolado del job de procesamiento), exactamente igual que para
un tenant preexistente.

**AC-15.** WHEN se invoca `POST :tenantId/properties/import` como parte del
wizard con un CSV que tiene filas inválidas mezcladas con filas válidas THE
SYSTEM SHALL importar las filas válidas y reportar las inválidas con su
número de fila y motivo, sin abortar el batch completo (comportamiento ya
existente, verificado como parte de este flujo end-to-end).

**AC-16.** THE SYSTEM SHALL preservar sin cambios el comportamiento de
`POST /admin/tenants` (creación bajo `MasterKeyGuard`, cifrado de
`accessToken`, generación de API key mostrada una única vez) y de `PATCH
:tenantId/token` (rotación de token bajo `TenantApiKeyGuard`).

## Decisiones (aprobadas por el usuario, 2026-07-24)

1. **Auth del wizard**: por ahora el wizard sigue exigiendo `X-Master-Key`;
   solo lo opera el propio usuario (dueño de la plataforma), no comerciales
   externos. No se introduce ningún rol nuevo de plataforma en esta fase —
   eso queda como posible follow-up si más adelante se delega el alta a
   terceros.
2. **Alta del OWNER**: se incluye dentro del mismo flujo del wizard (usa
   `bootstrap-owner`, también detrás de `X-Master-Key`, consistente con la
   decisión anterior).
3. **Alcance de `welcomeIntro`/`handoffIntro`**: queda acotado a la frase
   introductoria únicamente (Decisión 3 de modelado, sin cambios) — el aviso
   Ley 25.326 y la línea de horario siempre los agrega el backend.
