# 10 — Análisis: expiración de sesión por tiempo real + historial de propiedades

> **Estado:** ✅ Implementado y pusheado a `main` (ver §7). Se procedió con las
> recomendaciones de este mismo análisis (30 días, reset a `GREETING`
> reseteando `greetedAt`, chequeo perezoso sin job de fondo) sin pausar a
> confirmar cada una — mismo criterio que el resto de la sesión. El fix de
> `COMMERCIAL_QUALIFICATION` en el filtro de UI (frontend, §4) queda **fuera**
> de este trabajo, sin tocar.
> **Fecha base:** 2026-07-28
> **Dispara este análisis:** pregunta directa del usuario — "si consulto hoy y
> vuelvo en 2 meses, ¿el bot sabe que pasó tiempo? ¿guarda qué propiedades vi?"
> Verificado contra el código real: **hoy la respuesta es no a ambas.**
> **Método:** lectura directa del código (`src/conversation/`, `src/admin/`,
> `src/maintenance/`, `prisma/schema.prisma`, `frontend/`) — cero hipótesis sin
> verificar. Cada afirmación cita archivo:línea real.

---

## 0. Diagnóstico verificado

### 0.1 — No existe ninguna noción de tiempo real en la FSM

Grep exhaustivo de `lastMessageAt` en todo `src/conversation/`, `src/pipeline/`,
`src/leads/`: se **escribe** en cada turno
([conversation.engine.ts:401](../src/conversation/conversation.engine.ts))
pero **nunca se lee** en ningún punto de decisión de la FSM. La única
excepción real en todo el sistema es el timeout de 48hs de `HUMAN_HANDOFF`
(`GuardrailsService.isHandoffTimedOut`,
[guardrails.service.ts:76-82](../src/conversation/guardrails/guardrails.service.ts)),
que sí compara `Date.now() - handoffAt.getTime()`.

Todo lo demás usa **turnos**, no tiempo:
`isPriceStale` ([filters.util.ts:187-194](../src/conversation/filters.util.ts))
compara `currentTurnCount - filters.fPriceMentionedAtTurn`. El comentario del
propio archivo (línea 178) ya lo advertía: *"Si `fPriceMentionedAtTurn` es null
(...) se asume NO stale: mejor un falso negativo ocasional"* — un diseño
consciente para el problema de precio, pero que **no cubre nada más** (zona,
ambientes, operación, `greetedAt`, estado de la FSM).

**Confirmado con un incidente real** (memoria de sesión previa, 2026-07-22): un
lead reusado en pruebas arrastraba `fOperation=RENT`, `fMaxPrice=150000`,
`fMinRooms=5` y `greetedAt` seteado de sesiones de horas antes, y un "Hola"
nuevo no reseteaba nada. Con 2 meses de por medio, el mismo bug, pero con
datos mucho más viejos.

### 0.2 — No existe historial de propiedades mostradas

`Lead.lastSearchIds` es la única estructura relacionada, y se **sobreescribe
completo** en cada búsqueda nueva
([property-search.service.ts:183](../src/properties/property-search.service.ts),
[:289](../src/properties/property-search.service.ts) — nunca hace
`push`, siempre reemplaza). Está documentado como comportamiento intencional
en `docs/02-DATOS.md:258` porque `lastSearchIds` cumple una función de
seguridad (whitelist anti-alucinación en `output-validator.service.ts`), **no**
la de historial — son dos necesidades distintas que hoy comparten un solo
campo, y por eso "qué le mostré alguna vez" se pierde en cada búsqueda nueva.

Lo único con estructura real de "a través del tiempo" es `Appointment`
(un lead puede tener varias citas), pero eso es *visitas agendadas*, no
*propiedades consultadas en el chat*.

---

## 1. Decisión de diseño: ¿job de fondo o chequeo al llegar el mensaje?

Esta es la decisión que más impacto tiene en el riesgo de "buguear
conversaciones futuras", así que va primero.

### Opción A — Job programado (proactivo)

Ya existe el patrón exacto: `MaintenanceScheduler` + `MaintenanceProcessor`
([src/maintenance/](../src/maintenance/)), un *repeatable job* de
BullMQ (no `@nestjs/schedule`) que corre a las 3am y purga `WebhookEvent`
viejos. Sería mecánicamente calcable para "resetear leads inactivos".

**Por qué NO lo recomiendo como mecanismo principal:**
- Tocaría `state` (y por `@updatedAt`, `updatedAt`) de potencialmente miles de
  leads dormidos cada noche, sin que haya un turno de conversación real detrás.
- Un lead que hoy está en `SCHEDULING` con un `Appointment` `PROPOSED` sin
  resolver — si el job lo degrada a `QUALIFICATION` a medianoche, el filtro de
  UI "Agendó visita" (`LeadStateFilter.tsx:26`, `UI_STATE_GROUPS`) deja de
  mostrarlo al asesor al día siguiente, aunque la visita siga pendiente de
  confirmar. Es una obligación operativa real que un timer no debería poder
  esconder.
- Un job en batch necesitaría replicar el patrón atómico que ya usa
  `AdminLeadsService.optOut`/`.release`
  ([admin-leads.service.ts:91-105, 129-145](../src/admin/leads/admin-leads.service.ts)):
  `updateMany` con la condición de estado en el `WHERE`, para no pisar una
  transición que el bot hizo un instante antes. Es viable, pero es
  complejidad extra para un beneficio que la opción B da gratis.

### Opción B — Chequeo perezoso al llegar el próximo mensaje (recomendada)

Exactamente el mismo patrón que ya usa el timeout de `HUMAN_HANDOFF`: nada
cambia en la DB hasta que el lead **efectivamente escribe de nuevo**. En ese
momento, `GuardrailsService.evaluate` (o un chequeo nuevo en el mismo lugar)
compara `lead.lastMessageAt` contra `now` y decide si esta sesión "expiró".

**Por qué es la opción correcta:**
- **Cero riesgo de tocar conversaciones que no están pasando ahora mismo.**
  Un lead dormido sigue dormido — nada le llega, nada se le escribe, nada se
  actualiza — hasta que él mismo retoma. Responde directamente al pedido de
  "sin buguear las futuras conversaciones": no hay futuro turno que un
  proceso de fondo pueda pisar, porque el reset ocurre **en el mismo turno**
  en el que el lead vuelve, antes de que ese turno se procese normalmente.
- Reusa 100% el patrón ya probado y en producción (mismo lugar, mismo estilo
  de chequeo que `isHandoffTimedOut`).
- No requiere ningún job nuevo, ninguna queue nueva, ningún costo de
  infraestructura corriendo de fondo.
- Un lead con un `Appointment` abierto simplemente no tiene ningún turno
  entrante hasta que escribe — y en ese momento se puede (y se debe, ver
  §2.4) chequear explícitamente si hay una cita pendiente antes de decidir
  resetear cualquier cosa.

**Contras honestos de la opción B:** el panel de administración seguiría
mostrando el `state` "viejo" de un lead dormido hasta que vuelva a escribir
(ej. un lead sigue apareciendo como "En búsqueda" aunque hayan pasado 4 meses).
Esto es un problema de **presentación en el panel**, no de la FSM — y tiene
una solución mucho más barata que un job: calcular en el propio query/response
del admin (o incluso en el frontend) una bandera derivada `¿estaSesionExpirada
= lastMessageAt < cutoff?` **de solo lectura**, sin escribir nada a la DB.
Después decidís mostrarla como "Inactivo (4 meses)" en la UI sin haber tocado
un solo registro de conversación real.

**Recomendación: Opción B como mecanismo de la FSM, más un cálculo de solo
lectura (sin persistir) para que el panel pueda mostrar "inactivo hace X" si
hace falta.** Sin job, sin queue nueva, sin riesgo de tocar leads que no están
conversando en este instante.

---

## 2. Feature 1 — Expiración de sesión por tiempo real

### 2.1 — Umbral: ¿cuánto tiempo es "demasiado"?

No hay un único número correcto; depende del ciclo de venta inmobiliario
(semanas a meses). Propongo un valor único conservador como v1, con una nota
de mejora futura:

| Opción | Valor | Justificación |
|---|---|---|
| **Recomendado (v1)** | **30 días** | Ciclo típico de búsqueda de alquiler/compra en Argentina; suficientemente largo para no molestar a un comprador lento, suficientemente corto para no arrastrar datos de "otra vida" del lead. Mismo orden de magnitud que `WEBHOOK_EVENT_RETENTION_DAYS = 30` (`maintenance.constants.ts:2`), que ya fija ese número como "una ventana operativa razonable" en este proyecto. |
| Alternativa refinada (v2, no ahora) | Variable según `qTimeline` | Un lead con `qTimeline: 'inmediato'` que desaparece 15 días probablemente ya resolvió su búsqueda en otro lado; uno `'explorando'` puede volver perfectamente a los 3 meses sin que nada haya cambiado. Más preciso, pero es una tabla de umbrales por urgencia — más superficie para bugs. Dejar para una iteración posterior una vez que haya datos reales de cuánto tardan los leads en volver. |

**Decisión propuesta: 30 días fijos para todos los estados excepto
`HUMAN_HANDOFF`** (que ya tiene su propio timeout de 48hs, no se toca) y
excepto **cualquier lead con un `Appointment` `PROPOSED`/`CONFIRMED` sin
resolver** (ver 2.4 — la expiración de sesión conversacional no debe interferir
con una obligación operativa real).

### 2.2 — Qué se resetea y qué se preserva

Tabla completa, campo por campo, basada en el mapeo de dependencias
verificado. **Regla general: todo lo que es *historial* (evidencia,
trazabilidad) se preserva siempre; todo lo que es *estado de conversación
activa* (dónde estábamos parados) se resetea.**

| Campo | ¿Se resetea? | Por qué |
|---|---|---|
| `Message[]` (historial completo) | **Preservar siempre** | Es evidencia/trazabilidad (Ley 25.326); nunca se borra por inactividad. |
| `Appointment[]` | **Preservar siempre** | Historial operativo real; y si hay una cita abierta, bloquea la expiración entera (§2.4). |
| `id`, `phone`, `name`, `createdAt` | Preservar | Identidad del lead, no cambia. |
| `qScore`, `qScoreLabel` | Preservar (se recalcula solo en el próximo turno real) | `calculateLeadScore` ya se recalcula siempre al final de cada turno ([conversation.engine.ts](../src/conversation/conversation.engine.ts), lógica de T1.5); no hace falta tocarlo, el próximo turno lo corrige. |
| `state` | **Reset → `GREETING`** | Ver 2.3 — es la decisión de diseño central. |
| `fOperation`, `fNeighborhoods`, `fMaxPrice`, `fCurrency`, `fMinRooms`, `fGarage`, `fPetsAllowed`, `fNotes` | **Reset → `null`/`[]`** | Es exactamente lo que puede haber cambiado en 2 meses (presupuesto, zona de interés, composición familiar). Mantenerlos sería el bug que se está corrigiendo. |
| `fOfferedNeighborhoods` | Reset → `[]` | Oferta transitoria de una conversación que ya no existe. |
| `fPriceMentionedAtTurn`, `turnCount` | Reset → `null` / `0` | Son contadores de la sesión vieja; `isPriceStale` compara turnCount contra sí mismo, así que resetear ambos a la vez mantiene la comparación válida (no rompe nada, per confirmación directa del código). |
| `lastSearchIds` | Reset → `[]` | Las fichas que vio ya no son necesariamente relevantes 2 meses después (pueden estar vendidas/pausadas). El **historial** de que las vio se preserva aparte, en la tabla nueva de §3 — esto es justo la separación de responsabilidades que hoy falta. |
| `greetedAt` | **Reset → `null`** (ver nota) | Decisión de producto, no técnica: tratar la vuelta tras 30+ días como una sesión nueva de verdad, incluyendo repetir el aviso Ley 25.326. Alternativa: preservarlo y no re-mostrar el aviso — technically válido, pero mezclaría un "saludo de bienvenida corto" con "sigo sin saber qué buscás", una rama nueva que hoy no existe en `GreetingHandler`. Resetear `greetedAt` reusa el camino YA probado (`GreetingHandler.handle` con `alreadyGreeted=false` manda el saludo completo, cero código nuevo). |
| `nameAskedAt` | Reset → `null` | Si tiene `name` ya guardado, no se le vuelve a preguntar igual (la lógica de `shouldAskName` ya chequea `lead.name === null` primero). Si nunca lo dio, se le vuelve a dar la oportunidad. |
| `nameAskedAt` + `name` combinados | El `name` en sí **se preserva** | Ya sabemos cómo se llama; no hay razón para olvidarlo. |
| `qTimeline`, `qGuarantee`, `qPaymentMethod`, `qHasPropertyToSell`, `qAskedFields`, `qWantsStockAlert`, `qBuyingSignalAt`, `pendingPropertyId` | **Reset** | Toda la calificación comercial (T1.4/T1.5) es tan perecedera como los filtros de búsqueda — una garantía o forma de pago dicha hace 2 meses no es un dato confiable hoy. |
| `handoffAt`, `optedOutAt`, `contactedAt`, `nextActionAt` | Preservar | Son marcas de gestión humana/administrativa, no de la FSM del bot; no le corresponde a este mecanismo tocarlas. |
| `assignedUserId` | Preservar | Asignación humana, no se pierde por inactividad. |

### 2.3 — Estado de retorno: `GREETING` completo, no `resolveReleaseState`

El research confirma con precisión por qué **no conviene reusar
`resolveReleaseState` tal cual**:

1. Esa función resuelve una pregunta distinta: "¿a qué estado vuelve un lead
   que sale de un *bloqueo* administrativo de 48hs?", asumiendo implícitamente
   que sus datos siguen siendo válidos (por eso nunca mira `fOperation`, per
   comentario explícito en
   [release-state.util.ts:18-26](../src/conversation/release-state.util.ts)).
   La expiración por 30+ días es la pregunta inversa: "¿siguen siendo válidos
   estos datos?" — y la respuesta de este análisis es que no.
2. El comentario del propio archivo defiende como invariante que "salir de
   handoff" signifique lo mismo por los dos caminos que lo usan hoy
   (release manual del admin + timeout de 48hs). Bifurcar esa función con un
   flag oculto para un tercer caso rompería esa garantía explícita.
3. Como se resetea `greetedAt` en este flujo (a diferencia del release de
   handoff, que preserva el saludo ya dado), la función tal cual no aplica:
   asume que `greetedAt` no se toca.

**Decisión: nuevo estado de retorno fijo — siempre `GREETING`, sin
excepciones.** No hace falta una función nueva tipo `resolveExpirationState`
con ramas: dado que se resetean `fOperation`/`fNeighborhoods`/etc. a null (2.2),
el único estado coherente es `GREETING` (los handlers de `QUALIFICATION` en
adelante asumen que hay al menos algo de contexto). Esto además reusa
`GreetingHandler` sin ningún cambio de código — con `greetedAt=null` y
`fOperation=null`, ya manda el saludo completo por el camino existente
([greeting.handler.ts:34-75](../src/conversation/handlers/greeting.handler.ts)).

Si en el futuro se quiere un mensaje de "bienvenida de vuelta" más suave en
vez del saludo genérico (reconociendo que ya se habían hablado antes), es una
mejora de copy aislada — no cambia nada de este análisis.

### 2.4 — Guardrail: nunca expirar con una cita abierta

Antes de aplicar cualquier reset, chequear si existe un `Appointment` con
`status IN (PROPOSED, CONFIRMED)` para ese lead. Si existe, **no expirar** —
una visita pendiente es una obligación operativa real hacia el lead, y
degradar su conversación a `GREETING` sería perder el contexto de una cita que
sigue en pie. En ese caso, el lead vuelve exactamente donde estaba (el bot ya
está silenciado por `HUMAN_HANDOFF` si llegó a agendar, así que este caso ni
siquiera pasa por la FSM activa hoy — ver 2.6).

### 2.5 — Dónde engancha en el código

Mismo lugar que el timeout de `HUMAN_HANDOFF`: `GuardrailsService.evaluate`
([guardrails.service.ts:44-73](../src/conversation/guardrails/guardrails.service.ts)),
que ya es el único punto de la app donde se decide "algo pasa antes de llegar
al LLM/FSM normal". Se agregaría una rama nueva al `GuardrailAction`
(`guardrails.types.ts:1-6`, que hoy es
`'opt_out' | 'handoff' | 'silenced' | 'handoff_timeout_release' | 'continue'`):
un quinto tipo, p.ej. `'session_expired'`, evaluado **antes** de las ramas de
handoff (para que un lead con sesión vieja que además pide un humano siga
yendo a `handoff`, sin conflicto de precedencia) pero **después** de confirmar
que no hay un `Appointment` abierto.

`ConversationEngine.resolveGuardrail` (switch de
[conversation.engine.ts:301-...](../src/conversation/conversation.engine.ts))
ganaría un case nuevo: resetea los campos de 2.2, no manda ningún mensaje de
"salida" (a diferencia de opt_out/handoff, acá el turno sigue procesándose
normalmente — el lead escribió algo real, hay que contestarle), y deja que el
turno completo, ya con `effectiveLead` reseteado, siga fluyendo por el camino
normal (`GREETING` → saludo completo). Es decir: `stop: false`, con el
`leadUpdate` conteniendo todos los campos reseteados de la tabla 2.2 — el
mismo mecanismo que ya usa `handoff_timeout_release` para "esto se resetea y
el turno sigue".

### 2.6 — Interacción con `HUMAN_HANDOFF`

Un lead en `HUMAN_HANDOFF` ya tiene su propio timeout de 48hs (que además
resetea a `SEARCH_MATCH`/`QUALIFICATION` vía `resolveReleaseState`, sin tocar
filtros). Si pasan 30+ días de eso, ¿se debería aplicar TAMBIÉN la expiración
de sesión completa? Sí, pero en orden: primero se resuelve el release de
48hs (ya existe, no se toca), y si **después** de ese release siguen siendo
30+ días desde `lastMessageAt`, en el turno siguiente se aplicaría la
expiración completa igual. No hace falta lógica especial: los dos mecanismos
son independientes y se aplican en cascada de forma natural porque ambos
son chequeos perezosos sobre el mismo turno entrante.

### 2.7 — Escritura atómica (mismo patrón que `optOut`/`release`)

Aunque este chequeo corre síncronamente dentro de `handleTurn` (no es un job
de fondo compitiendo con el bot), sigue siendo buena práctica usar el mismo
patrón atómico que `AdminLeadsService` ya demuestra dos veces: `updateMany`
con la condición relevante en el `WHERE` en vez de leer-y-luego-escribir por
separado, para blindar contra una carrera si el mismo lead llegara a procesar
dos turnos casi simultáneos (deduplicación de `wa_message_id` ya cubre la
mayoría de estos casos, pero no cuesta nada ser consistente con el patrón ya
establecido).

---

## 3. Feature 2 — Historial de propiedades mostradas

### 3.1 — Tabla nueva: `LeadPropertyView`

```prisma
model LeadPropertyView {
  id         String   @id @default(cuid())
  tenantId   String
  tenant     Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  leadId     String
  lead       Lead     @relation(fields: [leadId], references: [id], onDelete: Cascade)

  // Sin @relation hacia Property, a propósito (ver 3.2): Property SÍ se
  // borra físicamente en este proyecto (properties-admin.service.ts:235),
  // y un historial no debería desaparecer ni bloquear ese borrado.
  propertyId String

  // Snapshot liviano de lo que se mostró en ESE momento (ver 3.2): el
  // historial tiene que seguir siendo legible aunque la Property ya no exista.
  titleSnapshot        String
  neighborhoodSnapshot String
  priceSnapshot        Decimal @db.Decimal(14, 2)
  currencySnapshot     String

  firstShownAt DateTime @default(now())
  lastShownAt  DateTime @default(now())
  timesShown   Int      @default(1)

  @@unique([leadId, propertyId])
  @@index([tenantId, leadId, lastShownAt])
}
```

### 3.2 — Por qué sin FK real a `Property`

Confirmado: `Property` tiene **borrado físico real**, expuesto en
`DELETE /admin/tenants/:tenantId/properties/:propertyId`
([properties-admin.service.ts:221-237](../src/admin/properties/properties-admin.service.ts)).
Ese mismo método ya bloquea el borrado si existe un `Appointment` apuntando a
esa propiedad (chequeo por valor, no por FK — `Appointment.propertyId` en el
schema es `String?` sin `@relation`, confirmado línea por línea). Un
historial de "propiedades vistas" es distinto de un `Appointment`: no es una
obligación operativa, es solo un registro — **no debería bloquear el borrado
de una propiedad vendida hace tiempo**. Por eso, mismo patrón que
`Appointment.propertyId`: id suelto, sin `@relation`, tolerando que quede
huérfano. El snapshot de título/zona/precio en la propia fila es lo que
garantiza que el historial siga siendo legible en el panel aunque la
`Property` original ya no exista (mismo criterio que ya usan
`describePropertyForLlm` y `formatPropertyCaption` para armar texto legible a
partir de una propiedad real, reusado acá como snapshot congelado).

`search-match.handler.ts:140-152` ya maneja hoy con gracia el caso de un id
de `lastSearchIds` que apunta a una `Property` borrada (mensaje conversacional
razonable en vez de crashear) — mismo principio de tolerancia a aplicar acá.

### 3.3 — Dónde se escribe

Un solo punto de enganche: `ConversationEngine.sendActions`, exactamente donde
hoy se valida el whitelist de `lastSearchIds` y se arma el caption
(`conversation.engine.ts`, rama `action.kind === 'property'`). Ahí, después de
confirmar que la propiedad está en la whitelist (mismo guardrail
anti-alucinación que ya existe) y antes/después de enviar la imagen, un
`upsert` sobre `LeadPropertyView` con `where: {leadId_propertyId: {...}}`:
si no existe, la crea con `timesShown=1`; si existe, `timesShown++` y
`lastShownAt=now()`. Esto es **aditivo puro**: no cambia el comportamiento de
`lastSearchIds` (que sigue siendo la whitelist de salida, sin tocar), no
cambia ningún handler existente — un solo punto de escritura nuevo en el
engine, cero riesgo para el flujo conversacional actual.

### 3.4 — Exposición al panel

`GET /admin/tenants/:tenantId/leads/:leadId/property-views` (nuevo endpoint,
mismo patrón que `GET /admin/tenants/:tenantId/leads/:leadId/messages` ya
existente), ordenado por `lastShownAt desc`. Es trabajo de panel (Fase A del
plan de `08-PROXIMOS-PASOS.md`), no toca la FSM en absoluto — se puede
implementar en cualquier momento sin relación con la Feature 1.

---

## 4. Hallazgo colateral (no pedido, pero real): `COMMERCIAL_QUALIFICATION` no está en el filtro de UI

Verificado: `LeadStateFilter.tsx:23-29` (`UI_STATE_GROUPS`) mapea
`ConversationState` a categorías de UI, pero el estado
`COMMERCIAL_QUALIFICATION` (agregado en la spec 09, T1.4, sesión anterior)
**no aparece en ningún grupo**. Un lead en ese estado no cae en ninguna
categoría filtrable salvo "Todas" (que no envía filtro). Es un bug de
seguimiento de T1.4 que no se detectó en esa sesión porque el frontend no
estaba en el alcance de esa spec. **Sugerencia:** agregarlo a
`'En búsqueda': ['SEARCH_MATCH', 'COMMERCIAL_QUALIFICATION']` (son
conceptualmente la misma etapa desde la perspectiva del asesor: el lead está
activamente decidiendo). Fix aislado de una línea, sin relación con este
análisis — lo marco para no perderlo, no lo toco ahora.

---

## 5. Resumen de decisiones propuestas

| Pregunta | Decisión |
|---|---|
| ¿Job de fondo o chequeo perezoso? | **Chequeo perezoso** al llegar el próximo mensaje, mismo patrón que el timeout de 48hs de `HUMAN_HANDOFF`. Cero jobs nuevos. |
| ¿Umbral de expiración? | **30 días** sin `lastMessageAt`, fijo (variable por urgencia queda para v2). |
| ¿Qué se resetea? | Todos los filtros (`f*`), toda la calificación comercial (`q*`), `state`, `greetedAt`, `nameAskedAt`, `turnCount`, `lastSearchIds`. |
| ¿Qué se preserva? | `Message[]`, `Appointment[]`, `name`, `qScore` (se recalcula solo), marcas administrativas (`handoffAt`, `optedOutAt`, `contactedAt`, `assignedUserId`). |
| ¿A qué estado vuelve? | **`GREETING`** completo (no `resolveReleaseState` — pregunta distinta, función nueva y más simple: reset total). |
| ¿Bloquea algo la expiración? | Sí: un `Appointment` `PROPOSED`/`CONFIRMED` abierto para ese lead. |
| ¿Dónde se engancha? | `GuardrailsService.evaluate`, quinto tipo de `GuardrailAction`. |
| ¿Cómo se ve el historial de propiedades? | Tabla nueva `LeadPropertyView` (snapshot, sin FK dura a `Property`), escrita en el único punto de envío de fichas del engine. |

---

## 6. Qué faltaba decidir (y qué se decidió al implementar)

1. **¿30 días es el número correcto?** Se implementó con 30 días fijos
   (`SESSION_EXPIRATION_MS` en `guardrails.service.ts`). Es una constante
   aislada — ajustarla después es un cambio de una línea, sin tocar lógica.
2. **¿Repetir el aviso Ley 25.326 tras 30+ días?** Se implementó reseteando
   `greetedAt`, o sea sí se repite — reusa 100% el camino ya probado de
   `GreetingHandler` sin código nuevo, que era el criterio técnico más simple
   y de menor riesgo.
3. **¿El fix de `COMMERCIAL_QUALIFICATION` en el filtro de UI?** Quedó **fuera**
   de este trabajo (es frontend, fuera del alcance backend de esta sesión).
   Sigue pendiente, señalado en §4.

## 7. Implementación (resumen)

- **Feature 2 (historial de propiedades):** modelo `LeadPropertyView` (spec 09
  ya tenía el precedente de escribir a mano las migraciones en este entorno,
  sin Postgres local — mismo caveat acá), upsert en
  `ConversationEngine.sendActions` justo después del guardrail de whitelist,
  endpoint `GET /admin/tenants/:tenantId/leads/:leadId/property-views`.
- **Feature 1 (expiración de sesión):** quinto tipo de `GuardrailAction`
  (`session_expired`) evaluado al final de `GuardrailsService.evaluate` (después
  de opt-out/handoff explícitos, que siempre ganan). El reset se persiste de
  **inmediato** en `ConversationEngine.handleTurn` (no alcanza con dejarlo en
  el `leadUpdate` del guardrail nomás — a diferencia de `handoff_timeout_release`,
  estos campos no forman parte de lo que ningún `HandlerResult` devuelve, así
  que si no se escriben ahí mismo se pierden). Veto por `Appointment` abierto
  resuelto en el engine (guardrails sigue siendo una clase pura, sin
  dependencia de Prisma). **No se reusó `resolveReleaseState`** (razón
  detallada en §2.3).
- **Tests:** `guardrails.service.spec.ts` (detección de expiración + prioridad
  de opt-out/handoff/estados especiales), `conversation.engine.spec.ts` (reset
  completo persistido, veto por cita abierta, no-regresión con sesión
  reciente, historial de propiedades con/sin whitelist). 623 tests, 60 suites,
  todos verdes.
- **Pendiente de validar contra DB real:** misma limitación que `docs/09` — no
  hay Postgres local en este entorno de trabajo. Antes de producción: correr
  `npx prisma migrate deploy` y probar manualmente un lead con `lastMessageAt`
  viejo para confirmar el reset end-to-end contra datos reales.
