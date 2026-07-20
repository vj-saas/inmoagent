# Guía de la conversación del bot — cómo funciona hoy

> Documento pensado para leer o pasarle a una IA y pedirle ideas para mejorar la
> conversación. Describe el comportamiento **real y actual** del agente de
> WhatsApp (no el plan, lo que efectivamente hace el código hoy).

---

## 1. El objetivo (una sola cosa)

El bot existe para **convertir una consulta de WhatsApp en una visita agendada con
un asesor humano**. Todo lo demás (saludar, calificar, mostrar propiedades) es
medio para llegar ahí. Atiende 24/7, nunca inventa propiedades y le pasa al
asesor un lead ya calificado.

Principio rector: **el LLM (OpenAI) nunca decide el flujo**. El flujo lo maneja
una máquina de estados en código. El LLM solo hace dos cosas:
1. **Entender** lo que escribe el lead (extraer datos de un texto libre).
2. **Redactar** mensajes amables sobre datos que le da el código.

El LLM jamás elige qué propiedad mostrar ni inventa precios: solo redacta sobre
resultados reales que el backend saca de la base de datos.

---

## 2. El flujo (máquina de estados)

```
SALUDO ──▶ CALIFICACIÓN ──▶ MOSTRAR PROPIEDADES ──▶ INTERÉS ──▶ AGENDAR ──▶ HUMANO
```

Estados reales del lead:

| Estado | Qué pasa |
|---|---|
| `GREETING` | Primer contacto: saluda, aviso de datos (ley 25.326), pregunta comprar/alquilar. |
| `QUALIFICATION` | Junta los datos mínimos para buscar, de a una pregunta por mensaje. |
| `SEARCH_MATCH` | Ya buscó y mostró propiedades reales con foto. Espera interés. |
| `SCHEDULING` | El lead quiere visitar una → se propone la visita. |
| `HUMAN_HANDOFF` | Pasa a un asesor humano. El bot se calla para ese lead. |
| `OPTED_OUT` | El lead escribió BAJA. No se le escribe nunca más. |

Reglas transversales (valen en cualquier estado, se evalúan **antes** del LLM):
- "BAJA" / "STOP" / "NO MOLESTAR" → `OPTED_OUT` inmediato.
- "quiero hablar con una persona" → `HUMAN_HANDOFF` (asesor humano, bot silenciado 48 hs).
- Pregunta fuera de tema (fútbol, política) → redirige amablemente sin cambiar de estado.

---

## 3. Qué datos junta, y en qué orden

Para poder buscar necesita: **operación** (comprar/alquilar) + al menos **2** de
estos tres → **zona, ambientes, presupuesto**.

Orden en que pregunta lo que falta (uno por mensaje, sin interrogatorio):
1. **Zona / barrio**
2. **Ambientes** (mínimo)
3. **Presupuesto** (máximo) ← va último

Además captura, si el lead los menciona: **cochera** y **acepta mascotas**
(filtros reales de búsqueda), y notas libres ("con patio", "luminoso").

Regla importante: **si desde el primer mensaje ya da varios datos, los toma
todos de una** y puede saltar directo a mostrar propiedades. Nunca vuelve a
preguntar algo que el lead ya dijo.

---

## 4. Cómo "toma" la información (el paso que más se nota)

Cada mensaje del lead pasa por 3 pasos:

1. **Extracción (LLM / OpenAI).** El mensaje va a OpenAI con una instrucción que
   pide devolver un JSON con: intención, operación, barrios, precio, moneda,
   ambientes, cochera, mascotas, notas, y "propiedad de interés". El LLM
   interpreta el lenguaje natural (entiende "2 amb", "500 lucas", "monoambiente",
   etc.).

2. **Validación / normalización (código).** El código limpia lo extraído:
   - Descarta valores imposibles (precio ≤ 0, ambientes > 10).
   - Normaliza los barrios (minúsculas, sin tildes) y resuelve alias
     ("Palermo Soho" → palermo, "Once" → balvanera, "Barrio Norte" → recoleta).
   - **Confía en la zona que dice el LLM** aunque no esté en su lista: si esa
     zona no tiene stock, se avisa (ver §6), en vez de rechazarla.

3. **Merge.** Combina lo nuevo con lo que ya sabía del lead (acumula, no pisa;
   salvo que el lead diga explícitamente que cambia de criterio).

> Ejemplo real: "Vi un depto en Monte Grande" → el LLM extrae
> `neighborhoods: ["Monte Grande"]` → el código lo normaliza a "monte grande" y
> lo toma como zona → busca → no hay stock → avisa "En Monte Grande no tenemos
> nada, ¿otra zona?".

---

## 5. Los mensajes exactos que manda (para mejorarlos)

Estos son los textos fijos (deterministas, sin LLM). **Son los mejores candidatos
para pulir el tono.**

- **Saludo (primer contacto):**
  > ¡Hola! Soy {bot}, el asistente virtual de {inmobiliaria}. Al continuar,
  > aceptás que {inmobiliaria} use tus datos para gestionar tu consulta
  > inmobiliaria. Escribí BAJA cuando quieras dejar de recibir mensajes.
  >
  > ¿Estás buscando comprar o alquilar?

- **Preguntas de calificación (una por vez):**
  - Zona → "¿En qué barrio o zona te gustaría buscar?"
  - Ambientes → "¿Cuántos ambientes buscás como mínimo?"
  - Presupuesto → "¿Cuál es tu presupuesto máximo?"

  (Estas preguntas a veces las redacta el LLM para que suenen más naturales según
  el contexto; el texto de arriba es el "fallback" garantizado.)

- **Antes de mostrar propiedades:** "Encontré estas opciones para vos:"
- **Ficha de cada propiedad** (con foto): título / barrio · moneda precio · N amb. / 1 feature / link.
- **Cierre tras mostrar:** "¿Te gustaría coordinar una visita a alguna?"

- **Zona sin stock:** "En {zona} no tenemos nada disponible por ahora 😕 ¿Te
  interesa que busque en otra zona?"
- **Sin resultados exactos pero amplió presupuesto/ambientes:** "No encontré nada
  exacto en esa zona, así que amplié un poco {el presupuesto / la cantidad de
  ambientes} y apareció esto:"

- **Fuera de tema:** "Prefiero enfocarme en ayudarte a encontrar tu próxima
  propiedad. ¿Seguimos con la búsqueda?"
- **Baja confirmada:** "Listo, no te vamos a escribir más. Si en algún momento
  cambiás de opinión, escribinos de nuevo."
- **Pase a humano:** "Te dejo con un asesor de {inmobiliaria}, te escribe a la
  brevedad. Horario de atención: {horario}."

---

## 6. Cómo busca y cómo maneja "no hay nada"

- Busca en la base **solo propiedades activas** de esa inmobiliaria, filtrando por
  operación + zona + (precio con +10% de tolerancia) + ambientes + cochera/mascotas
  si se pidieron.
- **La zona es sagrada:** nunca la amplía sola. Si la zona pedida no tiene stock,
  **avisa y pregunta por otra zona** (no muestra otras zonas sin permiso).
- Dentro de la zona pedida, si no hay match exacto, **flexibiliza primero el
  presupuesto, después los ambientes**, y muestra lo más cercano avisando que
  amplió.
- **Corte temprano:** si el lead menciona una zona sin stock, el bot lo dice
  enseguida (incluso desde el primer mensaje) en vez de seguir preguntando
  ambientes/presupuesto para después decir que no hay nada.

---

## 7. Límites actuales del demo (importante para probar)

- El inventario de prueba tiene propiedades **solo en 4 zonas**: **Palermo,
  Belgrano, Caballito y Villa Urquiza** (compra y alquiler en cada una).
- Cualquier otra zona (Bernal, Quilmes, Monte Grande…) dispara el aviso de "no
  tenemos nada, ¿otra zona?".
- Las fotos son de placeholder (no son fotos reales de inmuebles).
- El LLM es un modelo económico (gpt-4o-mini): rápido y barato, pero a veces hay
  que darle ejemplos concretos para que interprete bien casos borde.

---

## 8. Qué se puede ajustar fácil (para iterar con IA)

Si le pedís a una IA ideas para mejorar la conversación, estos son los puntos que
se pueden tocar **sin rehacer nada**, solo cambiando textos o reglas:

1. **Tono y wording** de todos los mensajes de §5 (saludo, preguntas, cierres).
2. **Orden de las preguntas** de calificación (hoy: zona → ambientes → presupuesto).
3. **Cuántos datos exige antes de buscar** (hoy: operación + 2 de 3).
4. **Qué campos captura** (hoy: zona, ambientes, presupuesto, cochera, mascotas).
5. **Comportamiento ante zona vacía** (hoy: pregunta antes de ampliar).
6. **Mensaje de cierre / llamada a la acción** para empujar a agendar la visita.

Preguntas útiles para hacerle a una IA con este documento:
- "¿Cómo hago que el saludo sea más cálido pero siga cumpliendo el aviso legal?"
- "¿Qué orden de preguntas convierte más visitas en una inmobiliaria argentina?"
- "Reescribí los mensajes de §5 en un tono más [cercano / profesional / vendedor]."
- "¿Qué preguntas de calificación me faltan para filtrar mejor a los leads?"

---

## 9. Lo que NO se puede cambiar solo con texto (requiere código)

- Que el bot recuerde toda la conversación (ya lo hace).
- Buscar en zonas que no están en el inventario cargado (hay que cargar esas
  propiedades por CSV o panel).
- Integrar un calendario real para agendar (hoy propone la visita y pasa a humano).
- Mandar mensajes proactivos fuera de la ventana de 24 hs (requiere plantillas
  aprobadas por Meta, con costo).
