# CLAUDE.md — Agente Comercial Inmobiliario 24/7

Contexto permanente del proyecto para Claude Code. Leer SIEMPRE antes de trabajar.

## Qué es este proyecto

SaaS multi-tenant: un agente conversacional de WhatsApp para inmobiliarias argentinas.
Recibe consultas de leads (texto y audio), califica (operación, barrio, presupuesto,
ambientes), busca propiedades reales en la base de datos, envía fichas con fotos y
agenda visitas con un asesor humano. Cada inmobiliaria (tenant) tiene su propio
número de WhatsApp conectado vía Meta WhatsApp Cloud API.

**Principio rector: el LLM NUNCA es fuente de verdad.** El flujo lo controla una
máquina de estados (FSM) en código. El LLM solo interpreta lenguaje natural
(extracción de filtros, redacción amigable) y solo puede listar propiedades que el
backend le entrega vía tool calling desde la DB.

## Stack (no cambiar sin discutirlo)

- **Backend:** NestJS 10+ (TypeScript, strict mode)
- **ORM:** Prisma
- **DB:** PostgreSQL (Supabase en deploy; docker-compose local)
- **Cola/cache:** Redis + BullMQ (Upstash en deploy; docker-compose local)
- **Mensajería:** Meta WhatsApp Cloud API (oficial, sin BSPs de terceros)
- **STT:** Groq API (whisper-large-v3-turbo) con fallback a OpenAI Whisper
- **LLM:** OpenAI (modelo económico configurable por env) detrás de una interfaz `LlmProvider`
- **Audio:** FFmpeg (binario del sistema) para conversión .ogg → .wav/.mp3
- **Deploy:** Railway (Docker: webhook + workers + FFmpeg en un solo proceso,
  más plugins de Postgres y Redis). Ver `docs/06-DEPLOY.md`. `railway.toml` en
  la raíz define el build y el healthcheck.

## Estructura de módulos NestJS

```
src/
├── config/            # Validación de env con zod/joi, tipado de configuración
├── prisma/            # PrismaService (module global)
├── tenants/           # CRUD tenants, resolución por phoneNumberId, credenciales
├── webhook/           # Endpoints GET/POST /webhook/whatsapp, firma, idempotencia
├── messaging/         # Cliente saliente Meta (texto, imagen, template), colas BullMQ
├── pipeline/          # Debounce/buffer de mensajes entrantes, orquestación por lead
├── media/             # Descarga de media de Meta, FFmpeg, transcripción STT
├── conversation/      # FSM, transiciones, guardrails de código
├── llm/               # LlmProvider (interfaz + adapter OpenAI), prompts, tools
├── properties/        # CRUD propiedades, búsqueda SQL, import CSV
├── leads/             # CRUD leads, sesiones, opt-out, handoff
├── appointments/      # Agendamiento de visitas
├── admin/             # API admin por tenant (API key), métricas
└── common/            # Guards, interceptors, filters, utils
```

## Convenciones

- Todo en español en mensajes al usuario final; código e identificadores en inglés.
- DTOs con `class-validator` en todos los endpoints.
- Toda query a DB filtrada por `tenantId`. NUNCA una query cross-tenant salvo en
  módulos internos explícitamente marcados.
- Los tokens de Meta por tenant se guardan cifrados (AES-256-GCM con `APP_ENCRYPTION_KEY`).
- Logs estructurados (pino) con `tenantId`, `leadId`, `waMessageId` como contexto.
- Tests: unit para FSM y guardrails (obligatorio), e2e para webhook con payloads
  reales de Meta (fixtures en `test/fixtures/meta/`).
- Commits convencionales (`feat:`, `fix:`, `chore:`).
- No agregar dependencias pesadas sin justificación (nada de LangChain/LangGraph).

## Reglas de negocio innegociables

1. El webhook POST responde 200 en < 1 segundo. Todo procesamiento va a cola.
2. Idempotencia: cada `wa_message_id` se procesa una sola vez (tabla `webhook_events`).
3. Debounce: mensajes del mismo lead se bufferizan 6 segundos antes de invocar al LLM.
4. El LLM jamás inventa propiedades: solo redacta sobre resultados de la tool
   `search_properties`. El backend valida que todo ID mencionado exista en el
   resultado de la búsqueda antes de enviar.
5. Primer mensaje al lead incluye aviso breve de tratamiento de datos (Ley 25.326)
   y que habla con un asistente virtual.
6. "BAJA" / "STOP" / "NO MOLESTAR" → opt-out inmediato, estado `OPTED_OUT`, no se
   le vuelve a escribir.
7. Pedido de humano ("quiero hablar con una persona") → estado `HUMAN_HANDOFF`,
   bot silenciado para ese lead hasta desbloqueo por admin o timeout de 48 hs.

## Documentación del proyecto

| Doc | Contenido |
|---|---|
| `docs/01-ARQUITECTURA.md` | Decisiones, diagrama, flujos end-to-end |
| `docs/02-DATOS.md` | Schema Prisma completo + índices + seed |
| `docs/03-CONVERSACION.md` | FSM, prompts, tools del LLM, guardrails |
| `docs/04-PLAN-FASES.md` | Plan de implementación por fases con criterios de aceptación |
| `docs/05-OPERACIONES.md` | Setup Meta, onboarding de tenants, costos |
| `docs/06-DEPLOY.md` | Deploy en Railway (paso a paso) |

## Comandos

```bash
npm run start:dev          # Dev con watch
npm run build && npm start # Prod
npx prisma migrate dev     # Migración en dev
npx prisma db seed         # Seed de datos de prueba
npm run test               # Unit tests
npm run test:e2e           # E2E (levanta Postgres/Redis de docker-compose)
docker compose up -d       # Postgres + Redis locales
```

## Variables de entorno (ver `.env.example`)

`DATABASE_URL`, `REDIS_URL`, `META_APP_SECRET`, `META_VERIFY_TOKEN`,
`APP_ENCRYPTION_KEY`, `OPENAI_API_KEY`, `GROQ_API_KEY`, `LLM_MODEL`,
`STT_PROVIDER` (groq|openai), `DEBOUNCE_SECONDS` (default 6),
`ADMIN_MASTER_KEY`, `PUBLIC_BASE_URL`.

---

<!-- ===== Ciclo SDD (agregado por /bootstrap-sdd) ===== -->

## Qué es low / medium / high en este proyecto

Estos criterios los usa `task-splitter` para etiquetar cada tarea y `task-router`
para elegir el implementer. Ante la duda entre dos niveles, elegí el más alto.

- **low** — sin lógica de negocio ni riesgo. Copy y mensajes en español al lead,
  ajustes de config, documentación (`docs/`, `README.md`), logs, formato/estilo,
  fixes de una línea.
- **medium** — features acotadas con lógica de negocio estándar que NO tocan la
  superficie crítica: CRUD y DTOs (`class-validator`) de `properties`, `leads`,
  `appointments`, `admin`; endpoints de lectura filtrados por `tenantId`;
  refactors locales; métricas.
- **high** — lógica compleja o de riesgo: FSM y guardrails de `conversation`;
  `webhook` (firma, idempotencia, respuesta <1s); debounce/orquestación de
  `pipeline`; tools y prompts del `llm` (búsqueda de propiedades vía tool
  calling); cifrado AES-256-GCM de tokens Meta; auth admin (argon2) y manejo de
  secretos; `media`/STT (FFmpeg, transcripción); colas BullMQ; **migraciones
  Prisma / cambios de schema**; cualquier query que cruce o resuelva `tenantId`.

## Qué se considera crítico en este proyecto

Lo que caiga acá dispara el pipeline SDD completo con **aprobación humana
obligatoria en cada fase** (lo lee `triage`).

- **Aislamiento multi-tenant.** Cualquier query o lógica que resuelva el tenant
  (por `phoneNumberId`) o que pueda filtrar datos entre tenants. Toda query a DB
  debe ir filtrada por `tenantId`; una query cross-tenant fuera de los módulos
  internos explícitamente marcados es crítica por definición.
- **Guardrails del LLM y la FSM.** Que el LLM nunca sea fuente de verdad: la FSM
  en código controla el flujo; el backend valida que todo ID de propiedad
  mencionado exista en el resultado de `search_properties` antes de enviar.
  Incluye la idempotencia del webhook (`wa_message_id` una sola vez), el debounce
  de 6s, el opt-out inmediato (BAJA/STOP), el aviso Ley 25.326 en el primer
  mensaje, y el handoff a humano.

> Nota: el cifrado de credenciales (tokens Meta, `APP_ENCRYPTION_KEY`, auth
> admin) y las migraciones de Prisma están clasificados como **high** en
> dificultad pero NO como críticos. Si querés que también exijan aprobación
> humana en cada fase, movelos a esta sección.
