# 04 — Plan de Implementación por Fases

Cada fase es una sesión de trabajo autocontenida para Claude Code. Instrucción
tipo para iniciar cada una:

> "Leé CLAUDE.md y docs/. Implementá la Fase N de docs/04-PLAN-FASES.md
> completa, con sus tests, y verificá los criterios de aceptación antes de dar
> por terminado."

Regla general: **no avanzar de fase con criterios de aceptación rojos.**

---

## Fase 0 — Scaffold y entorno local

**Tareas**
1. `nest new` con TypeScript strict, ESLint + Prettier, pino como logger.
2. `docker-compose.yml`: Postgres 16 + Redis 7 para desarrollo.
3. Módulo `config`: carga y validación de TODAS las env vars con zod al boot
   (falla rápido si falta alguna). `.env.example` completo y documentado.
4. `PrismaService` global + healthcheck `GET /health` (DB + Redis).
5. Setup de BullMQ (conexión Redis compartida, colas `inbound`, `media`,
   `outbound` declaradas).
6. README raíz con quickstart en 5 comandos.

**Criterios de aceptación**
- `docker compose up -d && npm run start:dev` levanta sin errores.
- `GET /health` → `{ db: "ok", redis: "ok" }`.
- Boot con env faltante → error claro indicando cuál.

---

## Fase 1 — Modelo de datos y seed

**Tareas**
1. Implementar `prisma/schema.prisma` según `docs/02-DATOS.md`. Migración inicial.
2. Helper de cifrado AES-256-GCM (`common/crypto.ts`) para `accessTokenEnc`,
   con tests.
3. Diccionario de normalización de barrios (`properties/neighborhoods.ts`) con
   alias de CABA + GBA norte/oeste/sur más comunes, y función `normalizeNeighborhood()`.
4. Seed: tenant demo (con phoneNumberId ficticio y API key impresa por consola)
   + 12 propiedades CABA con fotos placeholder según `02-DATOS.md` §4.

**Criterios de aceptación**
- `npx prisma migrate dev && npx prisma db seed` corre limpio.
- Test: mismo teléfono en dos tenants distintos → dos leads independientes.
- Test: cifrar/descifrar token round-trip OK; descifrado con clave errónea falla.
- `normalizeNeighborhood("Palermo Soho")` → `"palermo"`.

---

## Fase 2 — Webhook de Meta y envío saliente

**Tareas**
1. `GET /webhook/whatsapp`: validación de `hub.verify_token` + eco de
   `hub.challenge`.
2. `POST /webhook/whatsapp`:
   - Middleware de raw body + validación `X-Hub-Signature-256` (HMAC SHA-256 con
     `META_APP_SECRET`). Firma inválida → 401.
   - Parseo del payload (mensajes y statuses; los statuses solo se loguean y
     actualizan `Message.meta` si matchea `waMessageId`).
   - Resolución de tenant por `metadata.phone_number_id`; desconocido → 200 + warn.
   - Dedupe vía insert en `WebhookEvent` (catch de unique violation → 200).
   - Persistir `Message` IN + encolar en `inbound` (o `media` si es audio/imagen).
   - Responder 200 SIEMPRE en < 1 s (medir con interceptor de timing).
3. `MessagingService` (Meta Graph API v21+):
   - `sendText(tenant, to, body)`
   - `sendImage(tenant, to, imageUrl, caption)`
   - `markAsRead(tenant, waMessageId)` (buena UX: doble tilde azul)
   - Reintentos con backoff vía cola `outbound`; persistir `Message` OUT.
4. Fixtures de payloads reales de Meta en `test/fixtures/meta/` (texto, audio,
   imagen, status, retry duplicado).

**Criterios de aceptación**
- E2E: POST con firma válida → 200 + mensaje persistido + job encolado.
- E2E: firma inválida → 401, nada persistido.
- E2E: mismo `wa_message_id` dos veces → un solo registro y un solo job.
- E2E: p95 de respuesta del webhook < 500 ms con procesamiento mockeado.

---

## Fase 3 — Pipeline: debounce y audio

**Tareas**
1. **DebounceBuffer** (Redis + BullMQ delayed jobs):
   - Al llegar mensaje: `RPUSH debounce:{tenantId}:{leadId}`, cancelar/reprogramar
     el delayed job del lead a `DEBOUNCE_SECONDS`.
   - Al disparar: tomar todos los mensajes acumulados como un solo "turno".
   - Lock por lead (`SET NX` con TTL 60 s) durante el procesamiento del turno;
     si hay lock activo, reencolar el turno.
2. **MediaProcessor** (cola `media`):
   - GET `https://graph.facebook.com/v21.0/{mediaId}` con token del tenant → URL.
   - Descarga a tmp file (límite 16 MB, timeout 30 s).
   - FFmpeg: `.ogg/.m4a → .mp3 mono 16 kHz` (spawn de proceso, no librería wrapper).
   - `SttProvider`: adapter Groq (`whisper-large-v3-turbo`) y adapter OpenAI
     (`whisper-1`); selección por env, fallback automático si el primario falla.
   - Guardar `transcription` en el `Message` y recién entonces pasarlo al
     DebounceBuffer.
   - Limpieza de archivos temporales en `finally`.
3. Manejo de tipos no soportados: respuesta fija (ver `03-CONVERSACION.md` §3.4).

**Criterios de aceptación**
- Test: 5 mensajes en 4 s → un solo turno con los 5 textos concatenados en orden.
- Test: mensaje a los 7 s del anterior → dos turnos.
- Test: audio fixture .ogg → mp3 generado → STT mockeado → transcripción persistida.
- Test: caída del provider primario de STT → fallback usado, sin pérdida del mensaje.
- Sin archivos temporales huérfanos tras procesar (verificación en test).

---

## Fase 4 — ConversationEngine: FSM + LLM + búsqueda

**Tareas**
1. `LlmProvider` (interfaz): `extractIntent(context)` (structured output según
   `03-CONVERSACION.md` §4.1, validado con zod) y `composeReply(context)`.
   Adapter OpenAI con modelo de `LLM_MODEL`.
2. FSM: un handler por estado (`greeting.handler.ts`, etc.) que recibe
   `{lead, turnText, extraction}` y devuelve `{replies[], nextState, sideEffects}`.
   Transiciones SOLO en código.
3. Guardrails pre-LLM (§3 de `03-CONVERSACION.md`): opt-out, handoff, silencio,
   no soportados. Implementar como pipeline de checks con tests unitarios propios.
4. `PropertySearchService`: query SQL con tolerancia +10% de precio y relajación
   progresiva (`02-DATOS.md` §2). Actualiza `lead.lastSearchIds`.
5. Presentación de resultados: por cada propiedad, `sendImage` con caption
   formateado; si no hay foto, `sendText` con template determinístico.
6. Validación de salida (§5 de `03-CONVERSACION.md`) + formateador determinístico
   de fallback.
7. Contexto del LLM: últimos 12 mensajes del lead desde la tabla `messages`
   (recorte por tokens aproximado), filtros actuales y estado.

**Criterios de aceptación**
- Los 12 casos de prueba de `03-CONVERSACION.md` §7 pasan (LLM mockeado en unit,
  1 test de integración opcional con API real detrás de flag `E2E_LLM=1`).
- Ninguna respuesta saliente puede contener una propiedad fuera de
  `lastSearchIds` (test de la validación con mock malicioso).
- La extracción con schema inválido del LLM → reintento único → si falla,
  respuesta de aclaración pidiendo reformular (nunca crash).

---

## Fase 5 — Agendamiento, handoff y opt-out completos

**Tareas**
1. `AppointmentsService`: creación en SCHEDULING con propiedad vinculada;
   envío de `schedulingLink` del tenant o derivación directa.
2. HUMAN_HANDOFF completo: silencio del bot, `handoffAt`, timeout de 48 hs con
   retorno a QUALIFICATION, endpoint `POST /admin/leads/:id/release`.
3. OPTED_OUT completo + `DELETE /admin/leads/:id` (supresión Ley 25.326).
4. Notificación interna al tenant en cada handoff/agendamiento: mensaje de
   WhatsApp al número interno del tenant (campo nuevo `alertPhone` en Tenant)
   con resumen del lead (nombre, teléfono, filtros, propiedad de interés).
   Nota: esta notificación es business-initiated → requiere template aprobado;
   implementar con template `lead_alert` (ver `05-OPERACIONES.md` §5) y flag
   para desactivarla si el template no está aprobado aún.

**Criterios de aceptación**
- Flujo completo GREETING → ... → SCHEDULING → HUMAN_HANDOFF en e2e con mocks.
- Lead liberado por admin vuelve a responder; lead opted-out no recibe nada.
- Supresión borra lead + mensajes + turnos en Redis.

---## Fase 6 — API Admin, métricas y deploy

**Tareas**
1. Autenticación admin: guard por API key de tenant (argon2) + master key de
   plataforma para `POST /admin/tenants` (alta de inmobiliaria con cifrado del
   token de Meta).
2. Endpoints admin (todos tenant-scoped):
   - `GET /admin/leads?state=&page=` y `GET /admin/leads/:id/messages`
   - CRUD `/admin/properties` + `POST /admin/properties/import` (CSV con el
     formato documentado en `05-OPERACIONES.md` §4; validación fila por fila,
     reporte de errores por fila, upsert por `externalRef`)
   - `PATCH /admin/properties/:id/status` (pausar/marcar vendida — crítico)
   - `GET /admin/metrics` (leads nuevos, conversaciones activas, handoffs,
     citas propuestas/confirmadas, por rango de fechas)
3. Rate limiting global + por tenant en webhook y admin.
4. Job diario de purga de `WebhookEvent` (> 30 días) con BullMQ repeatable.
5. Deploy en Railway: `railway.toml` / Dockerfile con FFmpeg incluido
   (imagen node:20-slim + `apt-get install ffmpeg`), variables documentadas,
   healthcheck configurado. Servicios: backend, Postgres, Redis.
6. Checklist e2e manual con el sandbox de Meta (ver `05-OPERACIONES.md` §2).

**Criterios de aceptación**
- Import CSV de 50 filas con 3 erróneas → 47 upserted + reporte de las 3.
- API key de tenant A no puede leer datos de tenant B (test explícito).
- Deploy en Railway respondiendo el webhook público con firma válida.
- Checklist de sandbox completado con conversación real de punta a punta
  (texto y audio) desde un teléfono autorizado.

---

## Fase 7 — Post-MVP (no implementar hasta validar con piloto)

Backlog ordenado por valor:
1. **Re-engagement:** templates de Meta para recontactar leads fríos a las 24-72 hs
   (tabla `outbound_campaigns`, respeto estricto de opt-out). Costo por template
   enviado — modelarlo antes de activar.
2. **Dashboard web** (React + Vite + Tailwind, stack conocido): vista de leads,
   transcripciones, métricas, botón de release de handoff, gestión de inventario.
3. **Adapter Tokko Broker** (`InventorySource`): sync de inventario por cron cada
   4 hs (altas, bajas, precios). Misma interfaz que el import CSV.
4. **Calendly webhook** para confirmar `Appointment` automáticamente.
5. **Re-ranking semántico** con pgvector sobre `fNotes`/`extraRequirements`
   (solo si los pilotos muestran búsquedas "blandas" frecuentes).
6. **Detección de idioma** y soporte portugués/inglés (leads extranjeros en
   compra de inmuebles).
