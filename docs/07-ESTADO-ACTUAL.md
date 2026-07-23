# 07 — Estado actual: qué está implementado y cómo

> Documento de situación al **2026-07-23**. Describe lo que hoy existe en el
> código (no lo planificado). Complementa a `04-PLAN-FASES.md` (el plan) con la
> foto real de ejecución. Fuente: el propio repo — 126 archivos TypeScript,
> **206 tests unitarios + e2e pasando** (31 suites).

## Resumen en una línea

El **motor conversacional está terminado y es robusto**: recibe WhatsApp (texto y
audio), califica al lead, busca propiedades reales y las envía con fotos, y deriva a
un humano. Lo que **no** existe todavía es cualquier **interfaz para la persona de
la inmobiliaria** (todo el admin es API pura) y la **gestión de la visita después de
agendarla** (la cita se crea pero nunca se confirma ni se sigue).

---

## 1. Arquitectura y stack (implementado)

- **Backend:** NestJS 11 (TypeScript strict). Un solo proceso corre webhook + workers.
- **DB:** PostgreSQL vía Prisma 7 (adapter `pg`). Deploy: Supabase.
- **Colas/cache:** Redis + BullMQ. Deploy: Upstash.
- **Mensajería:** Meta WhatsApp Cloud API oficial (sin BSP de terceros).
- **STT:** Groq (`whisper-large-v3-turbo`) con **fallback automático** a OpenAI Whisper.
- **LLM:** OpenAI (`gpt-4o-mini` por default) detrás de la interfaz `LlmProvider`.
- **Audio:** FFmpeg del sistema (`.ogg` → formato para STT).
- **Deploy:** Render (Docker) + Supabase + Upstash. `render.yaml` es el blueprint.
- **Config:** validada con **zod** al arranque (`src/config/env.schema.ts`); si falta
  una variable, el proceso no levanta.

### Colas BullMQ activas
| Cola | Rol |
|---|---|
| `inbound` | procesa cada mensaje entrante persistido (`process-message`) |
| `media` | descarga de Meta + FFmpeg + transcripción STT |
| `outbound` | envío saliente a Meta (texto, imagen, template) con reintentos |
| `maintenance` | tareas programadas (purga de `webhook_events`, timeouts de handoff) |
| — job `process-turn` | job *delayed* del debounce que dispara el turno acumulado |

---

## 2. Flujo end-to-end (cómo funciona hoy, paso a paso)

```
WhatsApp del lead
      │
      ▼
[GET/POST /webhook/whatsapp]  ── firma X-Hub-Signature-256 verificada (MetaSignatureGuard)
      │                          responde 200 en <1s; todo el trabajo va a cola
      ▼
Idempotencia: wa_message_id se registra en tabla webhook_events (una sola vez)
      │
      ▼
[cola inbound] ── resuelve el tenant por phoneNumberId, persiste el Message
      │
      ├─ si es audio ──► [cola media] descarga + FFmpeg + STT (Groq→OpenAI) ──► transcription
      │
      ▼
[DebounceBufferService] ── bufferiza 6s los mensajes del mismo lead (agrupa ráfagas)
      │
      ▼
[ConversationEngine.handleTurn]  ◄── el corazón: la FSM en código
      │
      ├─ 1. Guardrails (opt-out / handoff / silenciado / release por timeout)
      ├─ 2. LLM.extractIntent → { intent, operación, barrio, precio, ambientes, ... }
      ├─ 3. mergeFilters + reglas determinísticas (precio viejo, zonas aledañas)
      ├─ 4. despacho al handler según estado (GREETING/QUALIFICATION/SEARCH_MATCH/SCHEDULING)
      ├─ 5. búsqueda SQL de propiedades (PropertySearchService) filtrada por tenantId
      ├─ 6. OutputValidator: bloquea enviar cualquier propiedad fuera de lastSearchIds
      └─ 7. envío por [cola outbound] (imagen con caption o texto)
      │
      ▼
Persiste el nuevo estado del lead + turnCount
```

**Regla de oro implementada:** el LLM **nunca** es fuente de verdad. Solo interpreta
lenguaje y redacta. Toda propiedad enviada tuvo que salir de una búsqueda SQL real y
pasar por `OutputValidatorService.isPropertyWhitelisted()`.

---

## 3. Máquina de estados (FSM) — implementada

Estados (`ConversationState`): `GREETING → QUALIFICATION → SEARCH_MATCH → SCHEDULING`,
más los dos terminales/laterales `HUMAN_HANDOFF` y `OPTED_OUT`.

| Estado | Handler | Qué hace |
|---|---|---|
| `GREETING` | `greeting.handler.ts` | saludo + aviso Ley 25.326 + "hablás con un asistente virtual" (una sola vez, marca `greetedAt`) |
| `QUALIFICATION` | `qualification.handler.ts` | extrae operación, barrio, presupuesto, ambientes; confirma moneda dudosa; ofrece zonas aledañas |
| `SEARCH_MATCH` | `search-match.handler.ts` | busca y muestra fichas; detecta cuál propiedad eligió el lead |
| `SCHEDULING` | `scheduling.handler.ts` | crea `Appointment` (PROPOSED), notifica al asesor, entrega link y **deriva a humano** |

### Guardrails (código, no LLM) — implementados
- **Opt-out inmediato:** "BAJA"/"STOP"/"NO MOLESTAR" → estado `OPTED_OUT`, no se
  vuelve a escribir.
- **Handoff a humano:** "quiero hablar con una persona" → `HUMAN_HANDOFF`, bot
  silenciado, alerta interna al asesor, y **release automático a las 48h**.
- **Anti-competidor:** si el LLM menciona a un competidor configurado, re-redacta una
  vez; si insiste, usa fallback determinístico.
- **Anti-datos-sensibles:** si la respuesta del LLM parece filtrar datos, se descarta
  y se usa un texto seguro.
- **Off-topic redirect:** si el lead se va de tema, lo trae de vuelta con simpatía.

---

## 4. Datos (Prisma) — implementado

Modelos: `Tenant`, `Property`, `PropertyPhoto`, `Lead`, `Message`, `Appointment`,
`WebhookEvent`. Con índices por `tenantId` en todo y `@@unique` de aislamiento.

Puntos destacados del modelo `Lead`: guarda los filtros capturados (`fOperation`,
`fNeighborhoods`, `fMaxPrice`, `fCurrency`, `fMinRooms`, `fGarage`, `fPetsAllowed`,
`fNotes`, `fPreferredDay`), el control de sesión (`state`, `handoffAt`, `optedOutAt`,
`greetedAt`, `turnCount`) y `lastSearchIds` para la validación de salida.

**Deuda visible en el schema:** `AppointmentStatus` define `PROPOSED / CONFIRMED /
DONE / CANCELLED`, pero **en el código solo se crea en `PROPOSED`**. No hay ninguna
transición a `CONFIRMED/DONE/CANCELLED` (ver §7).

---

## 5. Seguridad y multi-tenancy — implementado

- **Aislamiento:** toda query filtra por `tenantId`; hay un e2e dedicado
  (`lead-tenant-isolation.e2e-spec.ts`).
- **Tokens de Meta cifrados** con AES-256-GCM (`common/crypto.ts`, `APP_ENCRYPTION_KEY`).
- **Auth admin:** dos capas — `ADMIN_MASTER_KEY` (master, alta de tenants) y
  **API key por tenant** hasheada con argon2 (`TenantApiKeyGuard`).
- **Rate limiting** por tenant (`TenantThrottlerGuard`, `@nestjs/throttler`).
- **Firma de webhook** de Meta verificada byte a byte sobre el rawBody.

> ⚠️ **Importante:** la auth existente es de **máquina** (API keys). **No hay login de
> personas, ni roles, ni sesiones de usuario.** Eso es lo primero que hace falta para
> un panel (ver documento 08, Fase A).

---

## 6. API Admin — implementada (pero sin frontend)

Todo funciona por HTTP con API key. Endpoints existentes:

| Método | Ruta | Qué hace |
|---|---|---|
| `POST` | `/admin/tenants` | alta de tenant (requiere master key) |
| `PATCH` | `/admin/tenants/:id/token` | actualiza el token de Meta cifrado |
| `GET` | `/admin/tenants/:id/leads` | lista leads paginada, filtrable por estado |
| `GET` | `/admin/tenants/:id/leads/:leadId/messages` | historial completo del chat |
| `POST` | `/admin/tenants/:id/leads/:leadId/release` | saca al lead de HUMAN_HANDOFF |
| `DELETE` | `/admin/tenants/:id/leads/:leadId` | supresión Ley 25.326 (borra lead+mensajes) |
| `GET` | `/admin/tenants/:id/properties` | lista propiedades |
| `POST` | `/admin/tenants/:id/properties` | alta de propiedad |
| `POST` | `/admin/tenants/:id/properties/import` | **import CSV** de inventario |
| `GET` | `/admin/tenants/:id/properties/:pid` | detalle |
| `PATCH` | `/admin/tenants/:id/properties/:pid` | edición |
| `PATCH` | `/admin/tenants/:id/properties/:pid/status` | cambia estado (activa/reservada/...) |
| `DELETE` | `/admin/tenants/:id/properties/:pid` | baja |
| `GET` | `/admin/tenants/:id/metrics` | métricas por rango de fechas |
| `GET` | `/health` | healthcheck |

**Métricas que ya calcula** (`MetricsService`): leads nuevos, conversaciones activas,
handoffs, y citas propuestas/confirmadas — todo por rango de fechas.

> El backend ya expone casi todo lo que un panel necesitaría **leer**. Lo que falta es
> la cara (frontend) y los endpoints de **acción humana** sobre leads y agenda.

---

## 7. Lo que NO está implementado (huecos reales)

Esto es lo que separa "motor terminado" de "producto vendible". Se ataca en el
documento **08-PROXIMOS-PASOS.md**.

1. **No hay frontend / panel web.** Cero. Toda interacción es curl + API key. Una
   inmobiliaria no puede usar el sistema hoy.
2. **No hay login de personas ni roles.** Solo API keys de máquina.
3. **La agenda está a medias.** La cita se crea en `PROPOSED` y el lead se deriva a
   humano; **nunca hay confirmación, reprogramación, "hecha" o "no vino"**, ni
   recordatorio automático. Las métricas cuentan "confirmadas" que nada confirma.
4. **No hay cola de "llamar hoy"** ni registro del resultado de un contacto telefónico
   (notas, próximo paso, asignación de asesor). El lead calificado queda sin superficie
   de trabajo para el equipo.
5. **Carga de propiedades solo por CSV/API.** No hay formulario con carga de fotos.
6. **Onboarding de tenant es manual y pesado** (alta por API, credenciales de Meta,
   aprobación del template `lead_alert`). Sin wizard.
7. **Sin follow-up / re-enganche** de leads tibios ni recuperación de no-show.
8. **Todo probado con fixtures**, no con un número productivo de Meta y una
   inmobiliaria real (falta piloto).

---

## 8. Cómo correr lo que existe

```bash
docker compose up -d          # Postgres + Redis locales
npx prisma migrate dev        # schema
npx prisma db seed            # datos de prueba
npm run start:dev             # backend con watch
npm run test                  # 206 tests unit + e2e (verde hoy)
npm run test:e2e              # e2e con fixtures reales de Meta
```

Documentación de referencia ya existente: `01-ARQUITECTURA.md`, `02-DATOS.md`,
`03-CONVERSACION.md`, `04-PLAN-FASES.md`, `05-OPERACIONES.md`, `06-DEPLOY.md`,
`GUIA-CONVERSACION.md`, `QA-SIMULACION-PERSONAS.md`.
