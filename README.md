# agente-inmo

Agente comercial inmobiliario 24/7 por WhatsApp. SaaS multi-tenant en NestJS +
Prisma + Postgres + Redis/BullMQ. Ver `docs/` para arquitectura, modelo de
datos, lógica conversacional, plan de fases y operaciones.

## Quickstart (5 comandos)

```bash
cp .env.example .env          # completar valores reales (ver comentarios en el archivo)
docker compose up -d          # Postgres 16 + Redis 7 locales
npm install
npx prisma migrate dev        # aplica el schema (prisma/schema.prisma) a la DB local
npx prisma db seed            # tenant demo + 12 propiedades (imprime la API key demo por consola)
npm run start:dev             # levanta la API en http://localhost:3000 (watch mode)
```

Verificación rápida:

```bash
curl http://localhost:3000/health
# → { "db": "ok", "redis": "ok" }
```

## Modelo de datos y seed

`prisma/schema.prisma` implementa el modelo completo de `docs/02-DATOS.md`
(Tenant, Property/PropertyPhoto, Lead, Message, Appointment, WebhookEvent).

- `src/common/crypto.ts`: cifrado/descifrado AES-256-GCM (`accessTokenEnc` del
  tenant) usando `APP_ENCRYPTION_KEY`.
- `src/properties/neighborhoods.ts`: normalización de barrios (CABA + GBA
  norte/oeste/sur) con diccionario de alias coloquiales.
- `prisma/seed.ts`: crea un tenant demo (`inmobiliaria-demo`) con 12
  propiedades en Palermo/Caballito/Belgrano/Villa Urquiza. Es idempotente: si
  el tenant ya existe no rota la API key (sólo se imprime una vez, en la
  primera corrida).

## Webhook de WhatsApp y envío saliente

- `GET /webhook/whatsapp`: verificación de Meta (`hub.verify_token` + eco de
  `hub.challenge`). Usar `PUBLIC_BASE_URL/webhook/whatsapp` al configurar la
  app de Meta (ver `docs/05-OPERACIONES.md` §1).
- `POST /webhook/whatsapp`: valida `X-Hub-Signature-256` (401 si es inválida),
  resuelve el tenant por `phone_number_id`, deduplica por `wa_message_id`,
  persiste el mensaje y lo encola (`inbound` para texto, `media` para
  audio/imagen). Siempre responde 200 salvo firma inválida. Fixtures de
  ejemplo en `test/fixtures/meta/`.
- `MessagingService` (`sendText`/`sendImage`/`markAsRead`) encola en la cola
  `outbound`; `OutboundProcessor` la consume con reintentos/backoff, llama a
  la Graph API (`src/messaging/meta-graph.client.ts`) y persiste el `Message` OUT.

## Pipeline: debounce y audio

- `src/pipeline/debounce-buffer.service.ts`: agrupa mensajes de un lead en un
  buffer Redis y (re)programa un job delayed (`process-turn`, BullMQ) a
  `DEBOUNCE_SECONDS`. Lock por lead (`SET NX`, TTL 60s) al procesar el turno;
  si está tomado, se reencola en vez de perderse.
- `src/pipeline/inbound.processor.ts`: consume `inbound`. Mensajes de texto van
  al debounce; tipos no soportados (stickers, ubicación, etc.) responden un
  mensaje fijo al instante, sin pasar por el buffer.
- `src/media/`: consume `media`. Audio → descarga de Meta → FFmpeg
  (`.ogg` → mp3 mono 16kHz, `spawn` directo) → STT (`GroqSttProvider`
  primario, `OpenAiSttProvider` de fallback automático) → persiste
  `transcription` → recién ahí entra al debounce. Imagen → usa el caption (o
  un placeholder) directo. Limpieza de temporales garantizada en `finally`.

## ConversationEngine (FSM + LLM + búsqueda)

El motor conversacional del bot, en `src/conversation/`:

- **Guardrails pre-LLM** (`guardrails/`): opt-out ("BAJA"), pedido explícito de
  humano, y estado silenciado (OPTED_OUT terminal, HUMAN_HANDOFF con release
  automático a las 48hs). Se evalúan ANTES de llamar al LLM.
- **`LlmProvider`** (`src/llm/`): interfaz con adapter OpenAI (`LLM_MODEL`).
  `extractIntent` devuelve JSON estructurado validado con zod (reintento único
  si el schema es inválido; si vuelve a fallar, se le pide reformular al lead
  sin romper nada). `composeReply` redacta texto libre para las partes no
  determinísticas (preguntas de calificación, redirecciones off-topic).
- **FSM** (`handlers/`): un handler por estado (GREETING, QUALIFICATION,
  SEARCH_MATCH, SCHEDULING) que decide la transición en código, nunca el LLM.
- **`PropertySearchService`**: filtros duros + tolerancia +10% en precio,
  relajación progresiva barrio → ambientes → precio, `LIMIT 3`, actualiza
  `lead.lastSearchIds`.
- **Validación de salida** (`output-validator.service.ts` +
  `safe-reply.service.ts`): cualquier propiedad enviada se valida contra
  `lastSearchIds` antes de mandarse (whitelist real, no sólo documental);
  menciones de competidores se re-redactan una vez y si persisten usan un
  fallback determinístico; textos largos se truncan a 1200 caracteres.
- La presentación de propiedades (foto + caption, o texto si no hay foto) es
  100% determinística — el LLM nunca redacta datos de precio/dirección/etc.

## Agendamiento, handoff y opt-out (admin)

- `AppointmentsService` (`src/appointments/`): crea el `Appointment` (PROPOSED)
  al agendar una visita; `SchedulingHandler` decide `schedulingLink` del
  tenant o derivación a un asesor.
- **Notificación interna** (`src/conversation/lead-alert.service.ts`): en cada
  handoff/agendamiento, si `tenant.alertsEnabled` (default `false`) y
  `tenant.alertPhone` están configurados, envía el template `lead_alert`
  (business-initiated, requiere aprobación en el WABA — ver
  `docs/05-OPERACIONES.md` §5) con nombre/teléfono/filtros/propiedad del lead.
- **Admin API** (`src/admin/`), autenticada con `X-Api-Key` del tenant
  (argon2, guard `TenantApiKeyGuard`):
  - `POST /admin/tenants/:tenantId/leads/:leadId/release`: libera un lead de
    HUMAN_HANDOFF → QUALIFICATION (mismo efecto que el timeout de 48hs, pero
    manual).
  - `DELETE /admin/tenants/:tenantId/leads/:leadId`: derecho de supresión
    (Ley 25.326) — borra el lead, sus mensajes/citas (cascade), y limpia el
    buffer de debounce + job pendiente en Redis para ese lead.

## API Admin, métricas y rate limiting

- **Alta de tenant**: `POST /admin/tenants` (header `X-Master-Key`, guard
  `MasterKeyGuard`) — cifra el `accessToken` de Meta, genera y hashea (argon2)
  una API key nueva, y la devuelve una única vez en la respuesta.
- **Todo lo demás** vive bajo `/admin/tenants/:tenantId/...` (header
  `X-Api-Key` del tenant, `TenantApiKeyGuard`; cada query queda filtrada por
  ese `tenantId`, nunca cruza tenants):
  - `GET /leads?state=&page=`, `GET /leads/:id/messages`
  - `GET|POST /properties`, `GET|PATCH|DELETE /properties/:id`,
    `PATCH /properties/:id/status` (pausar/marcar vendida)
  - `POST /properties/import` (multipart, campo `file`): CSV según
    `docs/05-OPERACIONES.md` §4, upsert por `external_ref`; una fila inválida
    no aborta el resto — el reporte devuelve `{ imported, errors: [{row, message}] }`.
  - `GET /metrics?from=&to=`: leads nuevos, conversaciones activas, handoffs,
    citas propuestas/confirmadas en el rango.
- **Rate limiting**: global por IP (`ThrottlerModule`, 120 req/min) en toda la
  app, más un límite adicional por tenant (`TenantThrottlerGuard`, por
  `phone_number_id` en el webhook o `:tenantId` en el admin) en las rutas
  sensibles.
- **Purga diaria** (`src/maintenance/`): job repeatable de BullMQ (cron
  `0 3 * * *`) que borra `WebhookEvent` de más de 30 días.

## Deploy (Railway)

Setup con un solo proveedor (ver el paso a paso completo en `docs/06-DEPLOY.md`):

- **Railway — Postgres** (plugin) → `DATABASE_URL`.
- **Railway — Redis** (plugin) → `REDIS_URL`.
- **Railway — backend** → corre el proceso (webhook + workers BullMQ + FFmpeg,
  todo en el mismo contenedor Docker). `railway.toml` en la raíz define el
  builder (`Dockerfile`, `node:20-slim` + `ffmpeg`) y el healthcheck; el
  `Dockerfile` corre `prisma migrate deploy` automáticamente al bootear.

Los secretos y URLs se cargan a mano en la pestaña **Variables** del servicio
en Railway. `PUBLIC_BASE_URL` es la URL `*.up.railway.app` que se genera en
**Settings → Networking → Generate Domain**; el webhook de Meta apunta a
`PUBLIC_BASE_URL/webhook/whatsapp`.
> para las implicancias.

## Variables de entorno

Ver `.env.example`. Todas se validan con `zod` al boot
(`src/config/env.schema.ts`); si falta o es inválida alguna, la app no levanta
y el error indica exactamente cuál.

## Comandos

```bash
npm run start:dev          # Dev con watch
npm run build && npm start # Prod
npx prisma migrate dev     # Migración en dev
npx prisma db seed         # Seed de datos de prueba
npm run test               # Unit tests
npm run test:e2e           # E2E (requiere Postgres/Redis de docker-compose)
docker compose up -d       # Postgres + Redis locales
```

## Estructura

Ver `CLAUDE.md` (estructura de módulos y convenciones) y `docs/04-PLAN-FASES.md`
(plan de implementación por fases con criterios de aceptación).
