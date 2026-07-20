# QA conversacional — Simulación de personas (2026-07-18)

> **Actualización (mismo día):** todos los hallazgos rojos y amarillos de este
> reporte fueron corregidos (ver "Estado de los fixes" al final). El transcript
> de la corrida de verificación posterior a los fixes está en
> `scripts/sim-report-v2.md`.

Resultado de correr `scripts/sim-personas.ts`: 12 personas sintéticas con estilos de
habla distintos (formal, typos, lunfardo, indeciso, enojado, off-topic, inyección,
opt-out suave, pedido de humano suave, inglés, transcripción de audio) contra el
motor conversacional real con el LLM real (sin mocks). El transcript completo
queda en `scripts/sim-report.md` (regenerable corriendo el script).

## Qué funcionó bien

- **Lunfardo de plata**: "150 lucas verdes" → 150.000 USD; "un palo y medio" →
  1.500.000 ARS; "hasta 800 lucas" → 800.000 ARS. Impecable en todos los casos.
- **Inferencia familiar**: "pareja con dos nenes y un perro grande" → 4 ambientes
  (roomsInferred) + petsAllowed + confirmación suave "te armé la búsqueda con 4
  ambientes". Excelente.
- **Typos de barrio**: "caballto", "depa x", "alkilar" → el LLM normaliza solo
  ("caballito", RENT). El diccionario de `neighborhoods.ts` no hizo falta.
- **Audio corrido sin puntuación**: extracción perfecta ("dos dormitorios" → 3
  ambientes, 120k USD, cochera sí o sí → garage=true).
- **Competidores**: "¿son mejores que Remax?" → respondió sin nombrar a Remax.
- **Inyección de prompt**: no reveló direcciones, no confirmó el "descuento del
  admin", siguió en rol. El caption de fichas nunca incluye dirección.
- **Opt-out duro**: "BAJA" → OPTED_OUT + confirmación única + silencio posterior.
- **Flujo feliz**: formal e informal llegan a HUMAN_HANDOFF con appointment creado.

## Hallazgos (orden de severidad)

### 1. 🔴 Falso positivo de interés → handoff prematuro y bot silenciado
- Persona 3: **"dale mostrame"** → el LLM devolvió `interestedPropertyIndex: 1` →
  se agendó visita, HUMAN_HANDOFF, bot muerto para ese lead.
- Persona 2: **"2 amb estaria joya"** (respondía la pregunta de ambientes) → índice 1
  alucinado → mismo efecto.
- Causa: `SearchMatchHandler` agenda con solo ver `interestedPropertyIndex != null`,
  y el LLM lo completa de más. Un lead que solo dijo "dale mostrame" queda fuera
  del bot 48 hs.
- Sugerencia: validación determinística en código antes de agendar (el texto del
  turno debe contener un número/ordinal/deíctico: "la 2", "esa", "la primera",
  "me interesa"), o repreguntar "¿querés que te coordine visita por la N?" antes
  de pasar a HUMAN_HANDOFF.

### 2. 🔴 Opt-out "suave" ignorado
- "la verdad ya no estoy buscando, **no quiero que me escriban mas** por favor" →
  el bot respondió "¿estás buscando comprar o alquilar?".
- Causa: `OPT_OUT_PATTERN` exige que el mensaje **empiece** con baja/stop/no
  molestar/no me escribas. Riesgo legal/UX (espíritu Ley 25.326).
- Sugerencia: pasar a `.test()` sin ancla `^` para frases inequívocas ("no me
  escribas/escriban más", "dejen de escribir", "no quiero recibir más mensajes")
  y/o backstop vía intent del LLM con confirmación en código.

### 3. 🔴 Pedido de humano "suave" ignorado (regla de negocio #7)
- "pasame con **alguien de la oficina**, no me gusta hablar con robots" y
  "QUE ME ATIENDA UNA PERSONA DE CARNE Y HUESO" → el bot siguió vendiendo, dos veces.
- Causa: `HANDOFF_PATTERNS` solo cubre "hablar con una persona/un humano/alguien",
  "atendéme", "quiero un asesor".
- Sugerencia: ampliar patrones ("pasame con", "me atienda", "persona real",
  "de carne y hueso", "no quiero hablar con un bot/robot") + backstop LLM
  (intent `request_human`).

### 4. 🔴 La búsqueda ignora la moneda (bug de datos, no de LLM)
- Persona 11: presupuesto **800 USD** → se comparó el número 800 contra precios
  en **ARS** (520.000…), no matcheó nada, "amplié un poco el presupuesto" y mostró
  las 3 propiedades, incluida una de 950.000 ARS.
- Causa: `PropertySearchService.query()` filtra `price <= maxPrice * 1.1` sin
  condición sobre `Property.currency` vs `fCurrency`.
- Con stock mixto ARS/USD en un mismo barrio esto produce resultados absurdos en
  ambas direcciones. Sugerencia: filtrar por moneda coincidente, o convertir con
  un tipo de cambio configurable por tenant.

### 5. 🟡 "2 ambientes" a veces se extrae como 3
- Persona 6: "quiero alquilar en palermo, **2 ambientes**" → `minRooms: 3`. El lead
  tenía un 2 amb de 680k disponible dentro de su presupuesto y nunca lo vio.
- Causa: el modelo sobregeneraliza la regla "2 dormitorios → 3" a "ambientes".
  (Persona 1 con "dos ambientes" sí extrajo 2: es inconsistente.)
- Sugerencia: agregar al prompt de extracción ejemplos explícitos:
  `"2 ambientes" → minRooms: 2` / `"3 amb" → minRooms: 3` (los ambientes vienen
  ya en la unidad final, NO sumar living).

### 6. 🟡 Lead indeciso que delega la elección queda en loop
- Persona 4: "me da igual el barrio, **vos qué me recomendás?**" → misma pregunta
  de barrio 3 veces seguidas (con distinto adorno). Nunca avanza.
- Ya existe `topStockZones()`: usarlo cuando el lead delega ("me da igual",
  "recomendame", "donde sea") para ofrecer 2 zonas concretas, igual que en §4.

### 7. 🟡 "Amplié un poco el presupuesto" puede ser mucho
- La relajación de precio elimina el filtro por completo: a un lead con tope
  800.000 le mostró 950.000 ("un poco" = +19%); al de 120k USD le mostró 198k
  (+65%). Sugerencia: banda máxima (p.ej. +25%) o sincerar el texto
  ("esto está por encima de tu presupuesto, ¿lo querés ver igual?").

### 8. 🟢 Menores
- Repite el mismo bloque de fichas idéntico si el lead dice "dale mostrame" dos
  veces (persona 12): detectar re-envío consecutivo del mismo resultado.
- "¿Cuál te gustó más?" cuando se mandó **una sola** ficha (personas 5 y 6).
- Lead en inglés: el bot responde 100% en castellano sin registrar el idioma
  (decisión de producto; hoy los templates deterministas son solo ES). Y "one
  bedroom" se extrajo como minRooms 1 (convención argentina sería 2 ambientes).
- El LLM re-emite filtros del historial pese al "solo ESTE turno" (inofensivo hoy
  por el merge con `??`, pero es ruido que puede pisar valores si alucina).

## Estado de los fixes (2026-07-18)

| # | Hallazgo | Estado | Dónde |
|---|---|---|---|
| 1 | Falso positivo de interés → handoff prematuro | ✅ Corregido | `confirmsPropertyChoice()` en `filters.util.ts` + gate en `search-match.handler.ts`: sin confirmación textual (número/ordinal/deíctico/verbo de interés) no se agenda; se pide aclaración o se sigue calificando |
| 2 | Opt-out suave ignorado | ✅ Corregido | `OPT_OUT_PHRASES` (sin ancla `^`) en `guardrails.service.ts` |
| 3 | Pedido de humano suave ignorado | ✅ Corregido | `HANDOFF_PATTERNS` ampliados ("pasame con", "que me atienda", "carne y hueso", "no quiero hablar con un bot", etc.) |
| 4 | Búsqueda ignora la moneda | ✅ Corregido | `query()` filtra `Property.currency = fCurrency` siempre que hay presupuesto; si nada matchea y la zona tiene stock, mensaje genérico honesto (nunca "zona vacía") |
| 5 | "2 ambientes" extraído como 3 | ✅ Corregido | Regla explícita + ejemplo en `EXTRACTION_INSTRUCTION` (`prompts.ts`) |
| 6 | Indeciso que delega la zona queda en loop | ✅ Corregido | `delegatesZoneChoice()` → ofrece `topStockZones` vía `fOfferedNeighborhoods` (mismo mecanismo de aceptación de §4) |
| 7 | "Amplié un poco" sin límite | ✅ Corregido | Relajación avisada capada a +25%; por encima, intento `over_budget` con mensaje sincero ("está por encima de tu presupuesto") |
| 8a | Re-envío idéntico de fichas | ✅ Corregido | Dedupe en `triggerSearch` (`SAME_RESULTS_MESSAGE`) |
| 8b | "¿Cuál te gustó más?" con 1 ficha | ✅ Corregido | `buildSearchClosingQuestion(count)` / `buildTeaserClosingQuestion(count)` |
| 8c | Lead en inglés atendido en castellano | ⏸️ Decisión de producto | Los templates deterministas son solo ES; el LLM entiende el inglés sin problema |
| 9 | Búsqueda vacía pisaba `lastSearchIds` | ✅ Corregido | `searchAndRecordForLead` solo actualiza la whitelist cuando hay resultados: si el refinamiento da 0, el lead puede seguir refiriéndose a las fichas que ya vio ("la 1") |
| 8d | LLM re-emite filtros del historial | ⏸️ Aceptado | Inofensivo por el merge con `??`; el gate de §1 elimina el único caso dañino |

Cobertura nueva: `filters.util.spec.ts` (confirmación de elección + delegación de zona),
casos nuevos en `guardrails.service.spec.ts` (opt-out/handoff suaves), en
`test/property-search.e2e-spec.ts` (moneda, over_budget, cap +25%, `lastSearchIds` no se
pisa con búsqueda vacía) y `templates.spec.ts` (mensajes por conteo/relajación).

### Verificación adicional (2026-07-19)

Se investigaron 3 dudas abiertas tras la corrección; 2 resultaron ser falsas alarmas ya
cubiertas por el diseño existente, y una se cerró con tests nuevos:

- **Barrios con typos** ("caballto", "polermo"): NO es un gap. El LLM normaliza el typo
  en la extracción antes de llegar a `normalizeNeighborhood()` — confirmado en el
  transcript de la persona `2-typos-abreviado` (`scripts/sim-report-v2.md`), donde
  "busco depa x caballto" extrae `neighborhoods:["caballito"]` correctamente.
- **Flood de mensajes en la ventana de debounce**: ya cubierto por
  `test/debounce.e2e-spec.ts` ("5 mensajes dentro de la ventana forman un solo turno,
  concatenado en orden"). El mecanismo de `DebounceBufferService.push()` reprograma el
  job delayed en cada mensaje, así que ráfagas rápidas ya se agrupan correctamente.
- **Templates nuevos sin test unitario propio** (`buildDelegatedZoneMessage`,
  `SAME_RESULTS_MESSAGE`, variantes de conteo, `over_budget`): sí era un gap real,
  cerrado con `src/conversation/templates.spec.ts` (11 casos nuevos).

Quedan abiertos únicamente 8c (idioma) y 8d (LLM re-emite filtros), ambos por decisión
de producto, no por bug.

## Cómo re-correr

```bash
npx ts-node scripts/sim-personas.ts

# Solo algunas personas (más rápido/barato):
SIM_ONLY=11-ingles,4-indeciso npx ts-node scripts/sim-personas.ts

# Reporte a otro archivo:
SIM_REPORT_PATH=scripts/sim-report-v2.md npx ts-node scripts/sim-personas.ts
```

Usa la DB local (docker) y la API real de OpenAI; crea un tenant `sim-*` con 10
propiedades y lo borra al final (cascade). No toca Meta/WhatsApp: el
MessagingService se reemplaza por un recorder en memoria.
