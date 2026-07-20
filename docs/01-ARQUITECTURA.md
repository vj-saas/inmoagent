# 01 — Arquitectura

## 1. Decisiones de diseño (y por qué)

| Decisión | Elección | Justificación |
|---|---|---|
| Multi-tenancy | Base de datos compartida, aislamiento por `tenantId` en cada tabla | Costo mínimo por cliente, onboarding en minutos. Escalable a schema-per-tenant si algún día un cliente enterprise lo exige. |
| Número de WhatsApp | **Propiedad de cada inmobiliaria** (su Meta Business, su verificación) | La inmobiliaria tiene CUIT y pasa la Business Verification de Meta sin fricción; el desarrollador no carga con el compliance ni concentra riesgo de baneo. El activo (número + historial) queda del cliente. |
| Búsqueda de propiedades | SQL puro (filtros estructurados) en MVP | Los filtros del FSM (barrio, precio máx, ambientes) son filtros duros; SQL los resuelve mejor y más barato que similitud vectorial. Embeddings quedan como re-ranking opcional post-MVP. |
| Orquestación conversacional | FSM en código propio (enum + handlers por estado) | 5 estados no justifican LangGraph. Menos dependencias, testeable con unit tests, debuggeable. |
| Cola de procesamiento | BullMQ + Redis | Webhook debe responder < 1 s; retries automáticos ante fallos de OpenAI/Meta; el mismo Redis sirve para el debounce buffer. |
| STT | Groq (whisper-large-v3-turbo), fallback OpenAI | Menor latencia y costo para audios de 15-60 s; el fallback protege disponibilidad. |
| LLM | Interfaz `LlmProvider` con adapter OpenAI, modelo por env | Los modelos económicos rotan cada pocos meses; cambiar de modelo/proveedor no debe tocar lógica de negocio. |
| CRM externo | Interfaz `InventorySource` con implementación CSV/manual en MVP | Adaptadores futuros: Tokko Broker, Zonaprop feed, etc., sin tocar el core. |
| Fotos | Tabla `property_photos` con URLs públicas | WhatsApp Cloud API envía imágenes por URL. En real estate, sin fotos no hay conversión. |

## 2. Diagrama de componentes

```
 Lead (WhatsApp) ──▶ Meta Cloud API ──webhook──▶ [WebhookController]
                                                      │ (valida firma, dedupe, 200 <1s)
                                                      ▼
                                               [BullMQ: inbound-queue]
                                                      │
                              ┌───────────────────────┤
                              ▼                       ▼
                      [MediaProcessor]         [DebounceBuffer (Redis)]
                      audio→FFmpeg→STT          agrupa msgs 6s por lead
                              │                       │
                              └──────────┬────────────┘
                                         ▼
                                [ConversationEngine]
                          FSM + guardrails + LlmProvider
                                         │
                        ┌────────────────┼──────────────────┐
                        ▼                ▼                  ▼
                 [PropertySearch]  [Appointments]     [LeadSession]
                    SQL Postgres      Calendly/manual     estado FSM
                                         │
                                         ▼
                                 [MessagingService]
                              (texto, imágenes, templates)
                                         │
                                         ▼
                                  Meta Cloud API ──▶ Lead
```

Panel/API admin (por tenant, autenticado con API key) accede a leads, mensajes,
propiedades, métricas y desbloqueo de handoff.

## 3. Flujo end-to-end de un mensaje entrante

1. **Meta → `POST /webhook/whatsapp`.** Se valida `X-Hub-Signature-256` contra
   `META_APP_SECRET`. Firma inválida → 401 y log de seguridad.
2. **Ruteo de tenant.** Del payload se extrae `metadata.phone_number_id`; se
   resuelve el `Tenant`. Tenant inexistente o inactivo → 200 (para que Meta no
   reintente) + log warning.
3. **Idempotencia.** Se intenta insertar `wa_message_id` en `webhook_events`
   (unique). Si ya existe → 200 y fin (era un retry de Meta).
4. **Persistencia.** El mensaje crudo se guarda en `messages` (direction `IN`).
   Se responde 200. Todo lo demás es asíncrono.
5. **Media (si es audio/imagen).** Job en `media-queue`: GET autenticado a Meta
   para obtener URL de descarga → descarga → FFmpeg (.ogg → .mp3 16 kHz mono) →
   STT → se actualiza `messages.transcription`. Recién entonces entra al debounce.
6. **Debounce.** Clave Redis `debounce:{tenantId}:{leadId}` con TTL de
   `DEBOUNCE_SECONDS`. Cada mensaje nuevo resetea el timer (delayed job de BullMQ
   que se reprograma). Al expirar, se disparan juntos todos los mensajes
   acumulados como un solo turno de conversación.
7. **ConversationEngine.** Carga el `Lead` (o lo crea en estado `GREETING`),
   corre guardrails de pre-procesamiento (opt-out, pedido de humano, out-of-scope),
   ejecuta el handler del estado actual (ver `03-CONVERSACION.md`), que puede
   invocar al LLM con tools.
8. **Validación de salida.** Si la respuesta menciona propiedades, se verifica que
   cada ID provenga del último resultado de `search_properties`. Se aplican
   límites de longitud y filtro de menciones prohibidas.
9. **Envío.** `MessagingService` envía por Meta (texto y, si hay resultados,
   imágenes con caption por propiedad). Se persisten como `messages` `OUT`.
10. **Transición de estado** del FSM y `updatedAt` del lead.

## 4. Multi-tenancy en detalle

- `Tenant` guarda: nombre, `phoneNumberId` (unique — es la clave de ruteo),
  `wabaId`, token de acceso **cifrado**, configuración del bot (nombre del
  asistente, tono, link de agenda, horario de atención humana, lista de
  competidores a evitar, barrios que cubre) y flags de features.
- **Toda** entidad de negocio (`Property`, `Lead`, `Message`, `Appointment`)
  lleva `tenantId` con FK e índice compuesto.
- Unicidades compuestas: `(tenantId, phone)` en leads, `(tenantId, externalRef)`
  en propiedades.
- Un `TenantGuard` en la API admin inyecta el tenant desde la API key y un
  helper de repositorio fuerza el filtro `tenantId` en todas las queries.

## 5. Escalabilidad y adaptabilidad

- **Horizontal:** el backend es stateless (estado en Postgres/Redis); Railway
  puede escalar réplicas. BullMQ garantiza que cada job lo procesa un solo worker.
- **Concurrencia por lead:** lock Redis `lock:{tenantId}:{leadId}` durante el
  procesamiento de un turno para evitar respuestas duplicadas o cruzadas.
- **Puertos y adaptadores** (interfaces TypeScript):
  - `LlmProvider` → OpenAI hoy, cualquier otro mañana.
  - `SttProvider` → Groq / OpenAI.
  - `InventorySource` → CSV/manual hoy, Tokko/Zonaprop mañana.
  - `SchedulingProvider` → link de Calendly hoy, Google Calendar API mañana.
- **Post-MVP contemplado desde el diseño:** columna `embedding` en propiedades
  (nullable, se activa con pgvector cuando haga falta re-ranking semántico),
  templates de re-engagement (tabla `outbound_campaigns`), dashboard web.

## 6. Seguridad

- Firma de webhook obligatoria (`X-Hub-Signature-256`, HMAC SHA-256).
- Tokens de Meta por tenant cifrados en reposo (AES-256-GCM).
- API admin: API key por tenant (hasheada con argon2) + `ADMIN_MASTER_KEY` para
  operaciones de plataforma (crear tenants).
- Rate limiting en endpoints públicos (`@nestjs/throttler`).
- Prompt injection: el FSM decide las transiciones (no el LLM), las tools tienen
  parámetros validados con zod, y la validación de salida impide fugas de datos
  de otros tenants o propiedades inexistentes.
- Datos personales (Ley 25.326): aviso en primer contacto, opt-out por palabra
  clave, endpoint admin de borrado de lead (derecho de supresión).
