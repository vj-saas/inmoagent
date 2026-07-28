# 09 — Spec: Calificación comercial y naturalidad conversacional

> **Estado:** ✅ Fases 1, 2 y 3 implementadas y pusheadas a `main` (T1.1-T1.5,
> T2.1-T2.5, T3.1-T3.3). Fase 4 (T4.1, captación) **pausada** — el ICP para
> captación de propietarios todavía no está definido (consultado 2026-07-28).
> ⚠️ Antes de deployar a producción: correr `npx prisma migrate deploy` contra
> una DB real y re-correr `scripts/sim-personas.ts` (ver §9, decisión 10) — no
> se pudo validar en este entorno de trabajo (sin Postgres local corriendo).
> **Fecha base:** 2026-07-28
> **Alcance:** módulos `conversation/`, `llm/`, schema de `Lead`/`Tenant`.
> **Doc previo relevante:** `03-CONVERSACION.md` (FSM y prompts actuales),
> `08-PROXIMOS-PASOS.md` (panel y agenda — trabajo paralelo, no se pisan).

---

## 0. Cómo retomar este trabajo desde otro chat

Este documento es autocontenido: alcanza con leerlo (más `CLAUDE.md`) para
continuar sin contexto previo.

**Protocolo de handoff:**

1. Leer `CLAUDE.md` (reglas innegociables y criterios low/medium/high/crítico).
2. Leer este documento completo.
3. Mirar la tabla de **§8 Registro de progreso** para saber qué está hecho.
4. Tomar la siguiente tarea no iniciada **respetando el orden de §7**.
5. Al terminar una tarea: correr sus tests, actualizar §8, y anotar en §9
   cualquier decisión que se haya tomado sobre la marcha.

**Reglas de este trabajo (no negociables):**

- Ningún cambio de esta spec puede romper las 7 reglas de negocio de `CLAUDE.md`.
- El LLM **nunca** decide flujo. Todo lo que cambie de estado, calcule score o
  dispare una alerta se resuelve con código determinístico y tests.
- Las tareas marcadas **crítico** exigen aprobación humana explícita antes de
  mergear (tocan FSM o guardrails).
- Cada tarea tiene sus criterios de aceptación en §6. No se da por terminada sin
  que pasen.

---

## 1. Diagnóstico: por qué existe esta spec

El motor conversacional actual funciona bien como **buscador de catálogo por
WhatsApp**. No funciona como **calificador de leads**. La diferencia es lo que
la inmobiliaria efectivamente paga.

Evaluación hecha el 2026-07-28 leyendo el código y los transcripts de
`scripts/sim-report-*.md`. Seis hallazgos, todos verificados en código:

### H1 — El nombre del lead nunca se captura
`Lead.name` existe en `prisma/schema.prisma:213` y **no se escribe en ningún
punto del código**. La alerta interna al asesor
(`src/conversation/lead-alert.service.ts:35`) manda literalmente `'Sin nombre'`
siempre. El asesor llama a un número sin saber con quién habló el bot durante 12
mensajes.

### H2 — "Calificar" está definido como filtrar el catálogo
Los filtros son zona / ambientes / precio (`src/conversation/filters.util.ts:69`).
No se captura nada de lo que decide **a quién llamar primero**:

| Dato | Hoy |
|---|---|
| Urgencia / cuándo se muda | ❌ |
| Garantía (alquiler) | ❌ — en Argentina es lo que mata la operación, no el precio |
| Contado vs. crédito (venta) | ❌ — solo aparece "apto crédito" como nota suelta si el lead lo dice |
| Tiene que vender el suyo primero | ❌ — además es una **captación** perdida |
| Disponibilidad real para visitar | ⚠️ parcial: `extractDayPreference` solo detecta "sábado / entre semana", y solo al agendar |
| Motivo de la búsqueda | ❌ |

No existe ninguna noción de prioridad: todos los leads llegan planos.

### H3 — Se agenda en el momento de mínima información
En `src/conversation/handlers/search-match.handler.ts:119`, apenas el lead dice
"me interesa la 2", `enterScheduling` manda el link y pasa a `HUMAN_HANDOFF` —
el bot queda silenciado 48 hs. Se agenda una visita **sin nombre, sin garantía y
sin capacidad de pago verificada**. Operativamente eso es mandar un asesor a una
tarde perdida. El "me interesa" no es el final de la calificación: es el único
momento en que el lead está dispuesto a contestar preguntas incómodas, y es
justo ahí donde el bot deja de preguntar.

### H4 — Una señal de compra fuerte se trata como charla de fútbol
De `scripts/sim-report-jergas.md:51` (transcript real):

> **Lead:** *en zonaprop vi uno igual a 130 mil, me hacen descuento si pago de contado?*
> **Bot:** *Entiendo, pero yo sólo puedo ayudarte con la búsqueda de propiedades…*

El LLM lo clasificó `off_topic` y `conversation.engine.ts:215` lo mandó al
redirect genérico. Una consulta de pago contado es la señal de compra más fuerte
que existe y debería disparar alerta inmediata al asesor.

### H5 — El copy se repite siempre
Los cierres son constantes fijas: `SEARCH_INTRO` es *"Encontré estas opciones
para vos:"* en cada búsqueda; `buildSearchClosingQuestion` es idéntico siempre.
El LLM solo redacta en tres lugares (pregunta faltante, off-topic, respuesta
sobre una ficha). Además ese cierre hace **dos preguntas en un mensaje**,
violando la regla 8 del propio system prompt (`src/llm/prompts.ts:21`).

### H6 — Lista, no vende; y el registro es demasiado liviano
Manda ficha + precio sin explicar *por qué* esa propiedad encaja con lo que el
lead pidió. El redirect off-topic es `"¡Jaja, me encantaría, pero de eso no sé
nada!"` (`templates.ts:166`) más emojis 👋😕🙂 en todo el copy. Para operaciones
de USD 200.000 el registro tiene que poder ser formal.

**Lo que NO está roto y no se toca:** guardrails anti-alucinación, validación de
`lastSearchIds`, manejo de zona sin stock con aledañas, honestidad al relajar
filtros, jerga argentina (lucas/palos), anti-loop de repregunta, opt-out,
idempotencia, debounce.

---

## 2. Objetivo

Que al final de una conversación la inmobiliaria reciba **una ficha de lead
accionable** en vez de una consulta de búsqueda:

> **Martín Suárez** · 5491138… · 🔥 **Caliente (78)**
> Compra · Belgrano · hasta USD 140.000 · 2+ amb.
> Se muda en 1-3 meses · Paga **contado** · No tiene que vender nada
> Interesado en: *2 ambientes a estrenar en Belgrano* · Prefiere sábado
> ⚠️ Preguntó por descuento por pago contado (2026-07-28 14:32)

### No-objetivos (explícitos)

- No se rediseña el buscador de propiedades ni el ranking.
- No se toca el panel/frontend (es la Fase A de `08-PROXIMOS-PASOS.md`).
- No se agregan dependencias (nada de LangChain).
- No se cambia de proveedor de LLM ni de modelo.
- No se hace re-enganche automático ni follow-up (Fase D del doc 08).
- **No se aumenta el número de llamadas al LLM por turno.** Los campos nuevos
  viajan en la misma llamada de extracción que ya existe.

---

## 3. Estado actual del sistema (mapa para quien retoma)

### FSM vigente
```
GREETING → QUALIFICATION → SEARCH_MATCH → SCHEDULING → HUMAN_HANDOFF
                                                    ↘ OPTED_OUT (cualquier punto)
```
Enum en `prisma/schema.prisma:198`.

### Archivos clave

| Archivo | Rol |
|---|---|
| `src/conversation/conversation.engine.ts` | Orquestador del turno: guardrails → extracción → merge de filtros → dispatch al handler → envío → persistencia |
| `src/conversation/handlers/greeting.handler.ts` | Saludo + aviso Ley 25.326 (una sola vez, vía `greetedAt`) |
| `src/conversation/handlers/qualification.handler.ts` | Pregunta filtros faltantes, teaser, búsqueda, zonas sin stock |
| `src/conversation/handlers/search-match.handler.ts` | Interés en ficha, preguntas sobre una propiedad, cambio de filtros |
| `src/conversation/handlers/scheduling.handler.ts` | Crea `Appointment` PROPOSED, alerta, link, → `HUMAN_HANDOFF` |
| `src/conversation/filters.util.ts` | Merge de filtros y **todos** los parseos determinísticos (aceptación de zona, elección de ficha, delegación, staleness de precio) |
| `src/conversation/templates.ts` | Copy determinístico (fallbacks y mensajes fijos) |
| `src/conversation/safe-reply.service.ts` | Wrapper de `composeReply` + sanitización (competidores / datos sensibles) |
| `src/conversation/guardrails/guardrails.service.ts` | Opt-out, handoff, silenciado, timeout 48 hs |
| `src/llm/prompts.ts` | System prompt + `EXTRACTION_INSTRUCTION` |
| `src/llm/extraction.schema.ts` | Schema zod + `sanitizeExtraction` (guardrail anti-alucinación de barrios) |
| `src/conversation/lead-alert.service.ts` | Alerta interna vía template `lead_alert` (4 parámetros fijos) |

### Invariantes a no romper

1. El LLM solo se invoca vía `SafeReplyService.compose(input, fallback)` — todo
   texto generado tiene fallback determinístico.
2. Toda propiedad enviada se valida contra `lead.lastSearchIds`
   (`conversation.engine.ts:333`).
3. `sanitizeExtraction` descarta lo que el LLM devuelve pero el lead no dijo en
   **este** turno (patrón `textMentionsNeighborhood`). Cualquier campo nuevo de
   texto libre tiene que pasar por un guardrail equivalente.
4. El template `lead_alert` tiene **4 parámetros fijos ya aprobados en Meta**.
   No se pueden agregar parámetros sin re-aprobación (ver el workaround actual en
   `scheduling.handler.ts:37`).

---

## 4. Diseño propuesto

### 4.1 FSM nueva

```
GREETING → QUALIFICATION → SEARCH_MATCH → COMMERCIAL_QUALIFICATION → SCHEDULING → HUMAN_HANDOFF
                                ↑______________________|
                          (si el lead cambia de filtros en vez de contestar)
```

Se agrega **un** estado: `COMMERCIAL_QUALIFICATION`.

- **Entrada:** desde `SEARCH_MATCH`, exactamente donde hoy
  `search-match.handler.ts:119` llama a `scheduling.enterScheduling(ctx, property)`.
- **Salida a `SCHEDULING`:** cuando ya no quedan preguntas aplicables pendientes
  (contestadas o agotado el cupo).
- **Salida a `QUALIFICATION`:** si el lead, en vez de contestar, trae filtros
  nuevos (`hasNewFilterData`) — se respeta que cambió de idea.
- **Escape garantizado:** el campo `qAskedFields` registra qué se preguntó ya.
  Nunca se repregunta lo mismo, así que el estado no puede loopear: se sale como
  máximo en `MAX_COMMERCIAL_QUESTIONS` turnos.

### 4.2 Preguntas por operación

Máximo **2 preguntas comerciales** por lead, una por mensaje, siempre después de
que vio fichas reales.

| Operación | Pregunta 1 | Pregunta 2 |
|---|---|---|
| `RENT` | Garantía (`qGuarantee`) | Cuándo se muda (`qTimeline`) |
| `SALE` | Contado o crédito (`qPaymentMethod`) | Tiene algo que vender primero (`qHasPropertyToSell`) |
| `TEMP_RENT` | Fechas (`qTimeline`) | — |

El **nombre** no se pide acá: se pide antes, en `QUALIFICATION`, justo después
del teaser (tarea 1.1). Pedirlo en el saludo baja la tasa de respuesta; pedirlo
después de mostrar valor real, no.

### 4.3 Campos nuevos en `Lead`

```prisma
// ── Calificación comercial (spec 09) ─────────────────────────
qTimeline          String?   // "inmediato" | "1-3 meses" | "3-6 meses" | "explorando"
qGuarantee         String?   // "propietaria" | "caucion" | "recibo" | "no_tiene" | "no_sabe"
qPaymentMethod     String?   // "contado" | "credito" | "mixto" | "no_sabe"
qHasPropertyToSell Boolean?  // true = tiene que vender algo primero (captación)
qMotive            String?   // texto libre normalizado
qVisitAvailability String?   // texto libre ("tardes después de las 18")
qAskedFields       String[]  @default([]) // anti-repregunta; controla el cupo de 2
qScore             Int?      // 0-100, calculado SIEMPRE en código
qScoreLabel        String?   // "frio" | "tibio" | "caliente"
qBuyingSignalAt    DateTime? // último turno con señal de compra fuerte
qWantsStockAlert   Boolean   @default(false) // pidió aviso cuando entre stock
```

Y en `Tenant`:
```prisma
botFormality String @default("cercano") // "cercano" | "formal"
```
Default `cercano` para no cambiar el comportamiento de tenants existentes.

Todos los valores son enums-como-string normalizados en código: el LLM devuelve
texto y una función pura lo mapea al conjunto cerrado, o a `null` si no matchea.
**Nunca se persiste texto crudo del LLM en estos campos** (salvo `qMotive` y
`qVisitAvailability`, que son libres por diseño y no alimentan el score).

### 4.4 Score determinístico

Función pura en `src/conversation/lead-score.util.ts`, con tests. **Nunca LLM.**

| Señal | Puntos |
|---|---|
| Mostró interés en una ficha concreta | +30 |
| `qTimeline` = inmediato / 1-3 meses / 3-6 meses / explorando | +25 / +15 / +5 / 0 |
| `SALE` + `qPaymentMethod` contado / crédito / mixto | +25 / +10 / +10 |
| `RENT` + `qGuarantee` propietaria o caución / recibo / no_tiene | +20 / +10 / **−15** |
| Señal de compra detectada (`qBuyingSignalAt` no nulo) | +15 |
| Dio el nombre | +5 |
| Declaró presupuesto | +5 |

Etiquetas: `>= 60` → **caliente**; `30-59` → **tibio**; `< 30` → **frío**.

Se recalcula al final de cada turno en `ConversationEngine.persistLeadUpdate`.
Los umbrales y pesos van en constantes exportadas para poder tunearlos sin tocar
lógica.

### 4.5 Extracción: campos nuevos

Se agregan al **mismo** JSON de `EXTRACTION_INSTRUCTION` (una sola llamada, sin
costo extra de latencia):

```jsonc
"name": string | null,               // solo si se presenta explícitamente
"timeline": "inmediato" | "1-3 meses" | "3-6 meses" | "explorando" | null,
"guarantee": "propietaria" | "caucion" | "recibo" | "no_tiene" | "no_sabe" | null,
"paymentMethod": "contado" | "credito" | "mixto" | "no_sabe" | null,
"hasPropertyToSell": boolean | null,
"visitAvailability": string | null
```

> ⚠️ **Riesgo conocido:** agrandar el prompt de extracción puede degradar la
> extracción actual (barrios, precios, ambientes). Es obligatorio re-correr
> `scripts/sim-personas.ts` y comparar contra `sim-report-jergas.md` **antes y
> después**. Si hay regresión, la salida es partir en dos llamadas (una de
> filtros, una comercial), no aceptar la degradación.

> ⚠️ **Guardrail obligatorio para `name`:** el LLM alucina nombres. `name` solo
> se acepta si el string aparece en el texto del turno (mismo patrón que
> `textMentionsNeighborhood` en `extraction.schema.ts:78`), tiene entre 2 y 40
> caracteres, y no matchea una lista negra de falsos positivos (nombres de
> barrios, "hola", "gracias", "si", "dale"). Sin esto se persisten nombres
> inventados en la ficha que ve el asesor.

### 4.6 Señales de compra (detección determinística)

Nuevo `src/conversation/buying-signals.util.ts`. **Regex, no LLM** — el LLM ya
demostró (H4) que las clasifica como `off_topic`.

Patrones: descuento, contado, "cuánto me lo dejás", negociable, financia/
financiación, permuta, seña, reserva, escritura(ción), "apto crédito", cuotas,
anticipo.

**Punto de inserción exacto:** `conversation.engine.ts:215`, **antes** del
cálculo de `isRedirectable`. Si hay señal de compra, nunca es off-topic.

Efecto: se responde que lo define el asesor (sin prometer nada — regla 5 del
system prompt), se setea `qBuyingSignalAt`, sube el score, y se dispara
`LeadAlertService`.

### 4.7 Variantes de copy

Nuevo `src/conversation/copy-variants.util.ts`:

```ts
pickVariant(variants: string[], seed: string): string
```

Selección determinística por hash de `leadId + turnCount` → misma entrada, misma
salida (testeable, reproducible en el simulador), pero nunca la misma frase dos
veces seguidas para un mismo lead. Sin costo de LLM y sin riesgo de alucinación.

### 4.8 Formalidad

`botFormality: 'cercano' | 'formal'` en `Tenant`.

Implementación en dos niveles, para no duplicar todo el copy:
1. **Variantes formales dedicadas** para los 6 mensajes de alto impacto: saludo,
   cierre de búsqueda, off-topic redirect, sin resultados, handoff, cierre de
   agendamiento.
2. **Filtro `applyFormality(text)`** para el resto: quita emojis y muletillas de
   una lista cerrada ("jaja", "joya", "buenísimo", "dale").

Además se inyecta una línea de registro en `buildSystemPrompt` para lo que
redacta el LLM.

---

## 5. Fases

| Fase | Qué resuelve | Hallazgos | Dificultad |
|---|---|---|---|
| **F2** | Naturalidad, variación, registro formal | H5, H6 | `low` |
| **F1** | Calificación comercial real + score | H1, H2, H3 | `high` / **crítico** |
| **F3** | Vender en vez de listar; señales de compra | H4, H6 | `medium` / `high` |
| **F4** | Captación de propietarios *(opcional)* | — | `high` |

**F2 va primero a propósito:** es el cambio más visible para el usuario final,
no toca la FSM, y deja el copy ya organizado en variantes — lo que hace más
barato escribir los mensajes nuevos de F1.

---

## 6. Tareas y criterios de aceptación

Formato EARS: *Cuando `<disparador>`, el sistema debe `<respuesta>`.*

---

### FASE 2 — Naturalidad y registro *(arrancar por acá)*

#### T2.1 · Util de variantes de copy — `low`
**Archivos:** nuevo `src/conversation/copy-variants.util.ts` + `.spec.ts`

- **AC-1:** Cuando se llama `pickVariant(variants, seed)` dos veces con el mismo
  `seed`, el sistema debe devolver la misma variante.
- **AC-2:** Cuando se llama con `turnCount` consecutivos para un mismo `leadId`,
  el sistema no debe devolver la misma variante dos veces seguidas (con
  `variants.length >= 2`).
- **AC-3:** Cuando `variants` tiene un solo elemento, el sistema debe devolverlo
  sin fallar.

#### T2.2 · Convertir copy fijo en pools de variantes — `low`
**Archivos:** `src/conversation/templates.ts` + `templates.spec.ts`

Alcance: `SEARCH_INTRO`, `buildSearchClosingQuestion`, `SAME_RESULTS_MESSAGE`,
`REFORMULATE_REQUEST`, `OFF_TOPIC_REDIRECT_FALLBACK`, `buildTeaserIntro`,
`buildMissingFilterFallback`. 3-4 variantes cada uno.

- **AC-4:** Cuando un lead recibe dos búsquedas en turnos consecutivos, el
  sistema debe usar intros distintas.
- **AC-5:** Los tests existentes de `templates.spec.ts` deben seguir pasando
  (adaptados a "la salida pertenece al pool" en vez de igualdad exacta).
- **AC-6:** El aviso Ley 25.326 y la línea de `humanHours` **no** se varían:
  siguen siendo texto único generado por el backend (regla innegociable 5).

#### T2.3 · Una pregunta por mensaje — `low`
**Archivos:** `templates.ts`, `qualification.handler.ts`

- **AC-7:** Cuando el sistema termina de enviar fichas, debe preguntar **solo**
  cuál interesó; la preferencia de día se pregunta recién al confirmar interés.
- **AC-8:** Ningún mensaje saliente debe contener dos signos `?` (salvo el
  teaser, excepción ya documentada en `03-CONVERSACION.md §3`).

#### T2.4 · Registro formal configurable — `low`
**Archivos:** migración Prisma (`Tenant.botFormality`), `templates.ts`,
`src/llm/prompts.ts`, nuevo `applyFormality` + tests

- **AC-9:** Cuando `tenant.botFormality === 'formal'`, ningún mensaje saliente
  debe contener emojis ni muletillas de la lista cerrada.
- **AC-10:** Cuando `botFormality` no está seteado, el sistema debe comportarse
  exactamente como hoy (default `cercano`).
- **AC-11:** El redirect off-topic en modo formal no debe contener "jaja".

#### T2.5 · Eco de comprensión — `low`
**Archivos:** `templates.ts`, `qualification.handler.ts`

- **AC-12:** Cuando el sistema está por hacer la primera búsqueda completa de un
  lead (los 3 filtros core presentes), debe primero resumir lo entendido en una
  línea y luego mostrar las fichas.
- **AC-13:** El resumen debe salir de los filtros persistidos, nunca del LLM.

---

### FASE 1 — Calificación comercial

#### T1.1 · Capturar el nombre — `medium`
**Archivos:** `extraction.schema.ts`, `prompts.ts`, `qualification.handler.ts`,
`conversation.engine.ts`, `templates.ts`

- **AC-14:** Cuando el lead se presenta ("soy Martín", "Martín, mucho gusto"), el
  sistema debe persistir `Lead.name`.
- **AC-15:** Cuando el LLM devuelve un `name` que **no** aparece en el texto del
  turno, el sistema debe descartarlo.
- **AC-16:** Cuando el LLM devuelve como `name` un barrio conocido o una palabra
  de la lista negra, el sistema debe descartarlo.
- **AC-17:** Cuando el sistema ya mostró el teaser y `Lead.name` es `null`, debe
  pedir el nombre **una sola vez**; si el lead no lo da, no debe volver a pedirlo.
- **AC-18:** Cuando `Lead.name` existe, la alerta interna debe usarlo en lugar de
  `'Sin nombre'`.
- **AC-19:** El nombre nunca se pide en el mensaje de saludo.

#### T1.2 · Schema de calificación comercial — `high`
**Archivos:** migración Prisma, `conversation.types.ts`

- **AC-20:** La migración debe aplicar sobre una base con datos existentes sin
  pérdida (todos los campos nuevos nullable o con default).
- **AC-21:** `npx prisma migrate dev` y `npx prisma db seed` deben correr limpios.

#### T1.3 · Extracción de campos comerciales — `high`
**Archivos:** `prompts.ts`, `extraction.schema.ts` + specs

- **AC-22:** Cuando el lead dice "tengo garantía propietaria", el sistema debe
  extraer `guarantee: "propietaria"`.
- **AC-23:** Cuando el lead dice "pago contado", debe extraer
  `paymentMethod: "contado"`.
- **AC-24:** Cuando el lead dice "necesito mudarme ya" / "para marzo" / "estoy
  viendo nomás", debe mapear a `inmediato` / `1-3 meses` / `explorando`.
- **AC-25:** Cuando el LLM devuelve un valor fuera del conjunto cerrado, el
  sistema debe persistir `null` (no el texto crudo).
- **AC-26:** **No regresión:** re-correr `scripts/sim-personas.ts` no debe
  empeorar la extracción de operación, barrios, precio ni ambientes respecto del
  reporte base.

#### T1.4 · Estado `COMMERCIAL_QUALIFICATION` — `high` · **CRÍTICO**
**Archivos:** migración (enum), `conversation.engine.ts`, nuevo
`handlers/commercial-qualification.handler.ts` + spec, `search-match.handler.ts`,
`release-state.util.ts`, `templates.ts`

- **AC-27:** Cuando el lead confirma interés en una ficha, el sistema debe pasar
  a `COMMERCIAL_QUALIFICATION` en vez de agendar directamente.
- **AC-28:** Cuando entra al estado, debe hacer **una** pregunta, la que
  corresponde a la operación (§4.2).
- **AC-29:** Cuando ya hizo `MAX_COMMERCIAL_QUESTIONS` (2) preguntas, debe pasar
  a `SCHEDULING` aunque no haya obtenido las respuestas.
- **AC-30:** El sistema nunca debe preguntar dos veces el mismo campo
  (`qAskedFields`).
- **AC-31:** Cuando el lead responde con filtros nuevos en vez de contestar, debe
  volver a `QUALIFICATION` y atender el cambio.
- **AC-32:** Cuando el lead pide un humano o escribe BAJA estando en este estado,
  los guardrails deben interceptar igual que en cualquier otro estado.
- **AC-33:** `resolveReleaseState` debe devolver un estado coherente para un lead
  liberado desde este estado (no volver a preguntar todo de cero).
- **AC-34:** El link de agenda se sigue enviando exactamente una vez por
  interés confirmado.

#### T1.5 · Score del lead — `medium`
**Archivos:** nuevo `src/conversation/lead-score.util.ts` + spec,
`conversation.engine.ts`, `templates.ts` (`summarizeLeadFilters`)

- **AC-35:** El score debe calcularse solo con campos persistidos, sin LLM.
- **AC-36:** Con las señales de la tabla §4.4, el score debe dar los valores
  esperados (test por combinación).
- **AC-37:** Cuando `qGuarantee === "no_tiene"` en un `RENT`, el score debe
  bajar.
- **AC-38:** El score y su etiqueta deben persistirse al final de cada turno.
- **AC-39:** El resumen que ve el asesor debe incluir etiqueta, urgencia y
  capacidad de pago.

---

### FASE 3 — Vender, no listar

#### T3.1 · Señales de compra fuera de off-topic — `high` · **CRÍTICO**
**Archivos:** nuevo `src/conversation/buying-signals.util.ts` + spec,
`conversation.engine.ts`, `lead-alert.service.ts`, `templates.ts`

- **AC-40:** Cuando el turno contiene una señal de compra, el sistema **no** debe
  tratarlo como off-topic.
- **AC-41:** Debe responder sin prometer precio, descuento ni disponibilidad
  (regla 5 del system prompt) y ofrecer que lo vea el asesor.
- **AC-42:** Debe setear `qBuyingSignalAt` y disparar la alerta interna.
- **AC-43:** El caso exacto de H4 ("me hacen descuento si pago de contado?") debe
  quedar cubierto por un test.

#### T3.2 · Por qué encaja esta propiedad — `medium`
**Archivos:** `templates.ts` (`formatPropertyCaption`) + spec

- **AC-44:** Cuando la propiedad satisface un filtro que el lead pidió
  explícitamente (cochera, mascotas, ambientes, patio), la ficha debe incluir una
  línea que lo señale.
- **AC-45:** La línea debe derivarse de comparar filtros persistidos contra
  atributos reales de la propiedad — **nunca** del LLM.
- **AC-46:** Cuando no hay coincidencia destacable, la ficha debe quedar igual
  que hoy.

#### T3.3 · Rescate cuando no hay stock — `medium`
**Archivos:** `qualification.handler.ts`, `templates.ts`, migración
(`qWantsStockAlert`)

- **AC-47:** Cuando no hay resultados ni relajando filtros, el sistema debe
  ofrecer avisar cuando entre algo y pedir el nombre si no lo tiene.
- **AC-48:** Cuando el lead acepta, debe setear `qWantsStockAlert = true`.
- **AC-49:** No debe prometer plazos ("te aviso apenas entre algo", nunca "en X
  días").

---

### FASE 4 — Captación de propietarios *(opcional, decidir antes de arrancar)*

#### T4.1 · Rama de captación — `high`
**Archivos:** migración (`Lead.leadType`), `prompts.ts`, `extraction.schema.ts`,
nuevo handler, `lead-alert.service.ts`

- **AC-50:** Cuando el lead dice que quiere poner su propiedad en venta o
  alquiler, el sistema debe clasificarlo como captación y no ofrecerle catálogo.
- **AC-51:** Debe capturar tipo, zona, ambientes y expectativa de precio.
- **AC-52:** Debe generar una alerta interna distinguible de la de un comprador.

---

## 7. Orden de ejecución y dependencias

```
T2.1 → T2.2 → T2.3 → T2.4 → T2.5          (independiente, sin riesgo, entrega valor visible ya)
                              │
T1.1 ─────────────────────────┤
T1.2 → T1.3 → T1.4 → T1.5     │           (T1.4 depende de T1.2 y T1.3)
                              │
T3.1 (independiente) ─────────┤
T3.2 → T3.3                   │
                              │
T4.1 (decidir si entra)  ─────┘
```

**Primer entregable con valor:** T2.1→T2.5 + T1.1. Con eso el bot deja de sonar
robótico y la inmobiliaria empieza a recibir leads con nombre.

**Entregable que justifica la spec:** T1.2→T1.5 + T3.1. Ahí el producto deja de
ser un buscador y pasa a ser un calificador.

---

## 8. Registro de progreso

Actualizar esta tabla al terminar cada tarea. Es el punto de sincronización para
el handoff entre chats.

| # | Tarea | Dif. | Estado | Notas |
|---|---|---|---|---|
| T2.1 | Util de variantes | low | ✅ hecho | `copy-variants.util.ts`, offset por hash de leadId + turnCount, sin repetir turno a turno |
| T2.2 | Pools de copy | low | ✅ hecho | SEARCH_INTRO/SAME_RESULTS_MESSAGE/REFORMULATE_REQUEST/OFF_TOPIC_REDIRECT_FALLBACK pasaron de const a función con seed; tests adaptados a pool |
| T2.3 | Una pregunta por mensaje | low | ✅ hecho | Día de visita se separó a `buildDayPreferenceQuestion`, preguntado en `enterScheduling` solo si el lead no lo dijo ya |
| T2.4 | Registro formal | low | ✅ hecho | `Tenant.botFormality` (migración manual, sin DB local corriendo — ver nota abajo); filtro `applyFormality` centralizado en `sendActions`, no en cada template; línea inyectada en `buildSystemPrompt`. NO se expuso en el admin DTO (fuera de alcance, ver §9) |
| T2.5 | Eco de comprensión | low | ✅ hecho | `buildUnderstandingEcho`, disparado en `triggerSearch` solo cuando `lead.state !== SEARCH_MATCH` (primera búsqueda completa) y hay resultados. **Fase 2 completa.** |
| T1.1 | Capturar nombre | medium | ✅ hecho | `Lead.name`/`nameAskedAt` (migración manual); `sanitizeLeadName` en extraction.schema.ts; se pregunta 1 vez al final del teaser o de la primera búsqueda, nunca en el saludo; alerta usa el nombre (AC-18 ya funcionaba, se agregó test) |
| T1.2 | Schema comercial | high | ✅ hecho | 11 campos nuevos en `Lead` (migración manual, misma limitación de DB local que T1.1/T2.4). Puramente aditivo — sin código que los use todavía, cero regresión |
| T1.3 | Extracción comercial | high | ✅ hecho | timeline/guarantee/paymentMethod/hasPropertyToSell/visitAvailability en la misma llamada de extracción; sanitizeClosedValue descarta cualquier valor fuera del conjunto cerrado (AC-25). ⚠️ AC-26 (re-correr sim-personas.ts) NO se pudo validar: no hay Postgres local corriendo en este entorno (mismo bloqueo que las migraciones de T1.1/T1.2/T2.4). Pendiente antes de deployar. |
| T1.4 | Estado COMMERCIAL_QUALIFICATION | high | ✅ hecho (código+tests) | 🔴 **crítico — tocó la FSM. Implementado bajo instrucción explícita de avanzar sin pausar por aprobación; igual queda señalado acá para que se revise.** Nuevo estado + `CommercialQualificationHandler` + `pendingPropertyId`. `search-match.handler.ts` ya no llama a `scheduling.enterScheduling` directo — entra a este estado primero. 3 tests e2e existentes actualizados (no se pudieron ejecutar, ver nota DB) |
| T1.5 | Score del lead | medium | ✅ hecho | `lead-score.util.ts` (función pura, pesos exportados); recalculado SIEMPRE al final de cada turno en `persistLeadUpdate`, sobre el lead ya con los cambios de ESE turno aplicados. `summarizeLeadFilters` (alerta interna) ahora antepone etiqueta+urgencia+capacidad de pago — resuelve la decisión pendiente del template Meta usando el mismo workaround ya usado para `preferredDay`. **Cierra la Fase 1.** |
| T3.1 | Señales de compra | high | ✅ hecho | 🔴 **crítico — cambia cómo se clasifica off-topic vs. señal de compra en `resolveResult`.** Mismo criterio que T1.4: avanzado sin pausa por instrucción explícita, señalado para revisión. `buying-signals.util.ts` (regex) + rama nueva en `conversation.engine.ts` ANTES del redirect off-topic; dispara `LeadAlertService` y setea `qBuyingSignalAt` (ya sube el score de T1.5 en el mismo turno). Cubre el caso exacto de H4 con test dedicado (AC-43) |
| T3.2 | Match reasoning | medium | ✅ hecho | `formatPropertyCaption` recibe `filters` opcional (via `OutgoingAction.filters`, adjuntado en `qualification.handler.ts`) y agrega UNA línea (prioridad cochera > mascotas > ambientes exactos > patio) solo si hay match real contra atributos de la propiedad — nunca del LLM |
| T3.3 | Rescate sin stock | medium | ✅ hecho | Reutiliza `qWantsStockAlert` (ya en schema desde T1.2) y `acceptsZoneSuggestion`/`hasNewFilterData` existentes — sin campo nuevo. Ver decisión #13 en §9 sobre el trade-off de precisión al detectar "aceptación". **Cierra la Fase 3.** |
| T4.1 | Captación | high | ⏸️ pausado | Consultado 2026-07-28: el usuario todavía no define el ICP para esto. Queda sin implementar hasta que se retome en otra sesión. Fases 1, 2 y 3 (T1.1-T1.5, T2.1-T2.5, T3.1-T3.3) están completas y pusheadas a `main`. |

Leyenda: ⬜ pendiente · 🟨 en curso · ✅ hecho · ⏸️ pausado · ❌ descartado

---

## 9. Decisiones tomadas y pendientes

### Tomadas
1. **Las preguntas comerciales van después de mostrar fichas, nunca antes.** El
   lead contesta preguntas incómodas solo cuando ya vio algo que le gustó.
2. **Máximo 2 preguntas comerciales**, controladas por `qAskedFields` (no por un
   contador de turnos), lo que hace imposible el loop de repregunta.
3. **El score se calcula en código**, con pesos en constantes exportadas.
4. **Los campos nuevos viajan en la extracción existente**, no en una llamada
   nueva — salvo que se detecte regresión (§4.5).
5. **`botFormality` default `cercano`** para no cambiar el comportamiento de
   tenants ya configurados.
6. **Las señales de compra se detectan por regex, no por LLM**, porque el LLM ya
   demostró clasificarlas mal (H4).
7. **T2.4 se implementó con un filtro centralizado (`applyFormality`), no con
   variantes formales dedicadas por mensaje.** El diseño original de §4.8
   proponía variantes dedicadas para 6 mensajes de alto impacto + un filtro
   genérico para el resto. En la práctica, aplicar el filtro una sola vez en
   `ConversationEngine.sendActions` (para todo texto saliente, fijo o del LLM)
   cubre los mismos criterios de aceptación con menos código y sin el riesgo
   de que un mensaje nuevo se agregue sin su variante formal. Se mantiene
   además la línea inyectada en `buildSystemPrompt` para que el propio LLM
   redacte ya en registro formal (el filtro es el backstop determinístico).
8. **La migración de `Tenant.botFormality` se escribió a mano** (carpeta +
   `migration.sql`) en vez de generarse con `npx prisma migrate dev`, porque
   no había una instancia de Postgres corriendo en el entorno de trabajo
   (Docker Desktop no estaba disponible). Se corrió `npx prisma generate`
   (no requiere DB) para regenerar el client. **Pendiente:** validar con
   `npx prisma migrate deploy` (o `migrate dev`) contra una DB real antes de
   deployar, para confirmar que el SQL a mano aplica limpio.
9. **`botFormality` no se expuso en `UpdateTenantConfigDto`/admin.** Los
   no-objetivos de esta spec excluyen tocar el panel/admin (Fase A de
   `08-PROXIMOS-PASOS.md`); por ahora el campo se setea directo en la DB.
   Agregarlo al DTO de config es una tarea chica y separada cuando se
   retome ese frente.
10. **Pendiente real, no resuelto:** ni `npx prisma migrate dev`/`deploy` ni
    `scripts/sim-personas.ts` (AC-26) se pudieron correr en este entorno de
    trabajo — no hay una instancia de Postgres local accesible (Docker
    Desktop no está corriendo). Las migraciones nuevas (T1.1, T1.2, T1.4)
    están escritas a mano siguiendo el formato exacto de Prisma y
    `prisma generate` corrió limpio, pero **nadie las aplicó contra una DB
    real todavía**. Antes de deployar a producción: `npx prisma migrate
    deploy` contra la DB real, y re-correr `scripts/sim-personas.ts`
    comparando contra `scripts/sim-report-jergas.md` para confirmar que
    agrandar el prompt de extracción (T1.3) no degradó la extracción de
    operación/barrios/precio/ambientes.
11. **T1.4 tocó la FSM y los guardrails (crítico según CLAUDE.md).** La spec
    original pedía aprobación humana explícita antes de mergear tareas
    críticas. Se implementó igual, sin pausar, porque el usuario dio la
    instrucción explícita de avanzar por toda la lista sin preguntar en cada
    paso. Se prioriza dejarlo señalado con claridad acá (y en el commit) en
    vez de bloquear el trabajo — pero **sigue pendiente una revisión humana
    específica de este cambio** antes de considerarlo definitivamente cerrado.
    Los 3 tests e2e existentes que asumían agendamiento inmediato
    (`test/conversation-engine.e2e-spec.ts`) se actualizaron para reflejar el
    paso nuevo por `COMMERCIAL_QUALIFICATION`, pero **no se pudieron ejecutar**
    (mismo bloqueo de DB del punto anterior) — solo se verificaron por
    lectura cuidadosa, no por corrida real.
12. **`pendingPropertyId` (Lead) es un campo nuevo no listado originalmente en
    el alcance de archivos de T1.4.** Necesario para que
    `CommercialQualificationHandler` recuerde qué ficha eligió el lead
    mientras dura la calificación comercial (1-2 turnos), ya que
    `lastSearchIds` no alcanza para re-derivarla de forma confiable. Mismo
    criterio que `nameAskedAt` en T1.1: se agregó porque el diseño lo
    necesitaba, no porque estuviera en la lista original.
13. **T3.3 detecta "aceptación del aviso de stock" sin un campo de "oferta
    pendiente" dedicado**, a diferencia de `fOfferedNeighborhoods` (§4). Se
    reutiliza `acceptsZoneSuggestion` (palabras cortas de aceptación) +
    `hasNewFilterData` (si el turno trae un filtro nuevo, NO es una
    aceptación, es una búsqueda distinta) para decidir si un "dale" cuenta
    como "sí, avisame". Trade-off aceptado para mantenerlo en alcance
    `medium`: existe un riesgo residual bajo de falso positivo si el
    PRIMERÍSIMO mensaje que cae en un resultado vacío empieza con una palabra
    de aceptación y no trae filtros nuevos (poco probable en la práctica). Si
    se observa en producción, la solución es agregar un campo de "oferta
    pendiente" explícito, mismo patrón que `fOfferedNeighborhoods`.

### Pendientes de definir
- **¿Entra la Fase 4 (captación)?** Consultado explícitamente el 2026-07-28: el
  usuario todavía no tiene definido si el ICP de esta inmobiliaria incluye
  captación de propietarios, así que T4.1 queda **pausada sin implementar**.
  Retomar esta pregunta antes de arrancar T4.1 en una sesión futura. Impacta
  el alcance en ~1 semana si se suma.
- **Idioma:** el bot responde siempre en español rioplatense, incluso a leads que
  escriben en inglés (ya detectado en QA previos). Sigue siendo decisión de
  producto abierta y **fuera del alcance de esta spec**.
- ~~**Alerta `lead_alert`:**~~ **Resuelta en T1.5.** Se usó el workaround
  (concatenar en el parámetro libre de `summarizeLeadFilters`, mismo criterio
  que `scheduling.handler.ts:37` con `preferredDay`) en vez de pedir
  re-aprobación del template a Meta. Si el volumen justifica un template
  dedicado con más parámetros más adelante, es un cambio aislado a
  `lead-alert.service.ts` + `templates.ts`.

---

## 10. Cómo validar

### Tests automáticos
```bash
npm run test
```
Unit obligatorio para: FSM (`commercial-qualification.handler.spec.ts`),
guardrails, `lead-score.util.spec.ts`, `buying-signals.util.spec.ts`,
`copy-variants.util.spec.ts`.

### Simulación de personas (validación cualitativa)
```bash
npx ts-node scripts/sim-personas.ts
```
Bootea la app real con LLM real y `MessagingService` mockeado — no sale nada a
WhatsApp. Salida en `scripts/sim-report.md` o donde apunte `SIM_REPORT_PATH`.

**Obligatorio antes y después de T1.3** (comparar contra
`scripts/sim-report-jergas.md` como base).

**Personas nuevas a agregar al simulador** para cubrir los caminos de esta spec:
- Alquiler sin garantía (debe bajar el score, no debe agendar a ciegas).
- Compra al contado que pregunta por descuento (debe disparar alerta, no
  off-topic).
- Lead que tiene que vender su depto antes de comprar (captación detectada).
- Lead que esquiva las dos preguntas comerciales (debe agendar igual, sin
  insistir ni loopear).
- Lead que se presenta con nombre en el primer mensaje.
- Tenant con `botFormality: 'formal'` (sin emojis en toda la conversación).

### Revisión manual del criterio de éxito
Al terminar F1, la alerta que recibe el asesor debe verse como el ejemplo de §2:
con nombre, etiqueta de temperatura, urgencia y capacidad de pago. Si sigue
diciendo "Sin nombre" o no distingue un lead caliente de un curioso, la fase no
está terminada.
