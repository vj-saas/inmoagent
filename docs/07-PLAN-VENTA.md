# 07 — Plan para llevar el producto a venta (post-MVP)

Continúa `04-PLAN-FASES.md` (Fases 0-6, ya implementadas). Este plan cubre lo
que falta para vender el producto a inmobiliarias reales: que funcione de
punta a punta sin supervisión y que el dashboard no espante al cliente.

Misma regla: **no avanzar de fase con criterios de aceptación rojos.** Instrucción
tipo para iniciar cada una:

> "Leé CLAUDE.md y docs/. Implementá la Fase N de docs/07-PLAN-VENTA.md
> completa, con sus tests, y verificá los criterios de aceptación antes de dar
> por terminado."

---

## Fase A — Cerrar el MVP de verdad (antes de tocar UI)

No tiene sentido vender algo lindo que no funciona. Primero confirmar que las
Fases 0-6 de `04-PLAN-FASES.md` están realmente cumplidas, no solo con código
escrito.

**Tareas**
1. `npm run test && npm run test:e2e` en verde, sin skips.
2. Checklist manual de `05-OPERACIONES.md` §2 con el sandbox de Meta: una
   conversación real de punta a punta (texto y audio) desde un teléfono
   autorizado, contra el deploy de Railway.
3. Confirmar aislamiento multi-tenant con un test explícito nuevo si no existe
   (API key de tenant A no puede leer datos de tenant B).
4. Confirmar `helmet`/headers de seguridad y CSP básica en `main.ts` (no
   estaba verificado en la última auditoría).

**Criterios de aceptación**
- Suite completa en verde.
- Conversación real completa: saludo con aviso Ley 25.326 → calificación →
  propiedades reales con foto → agendamiento → notificación al tenant.
- Reporte escrito de la corrida (qué falló, qué se corrigió).

---

## Fase B — Design system y UI base

Reemplazar el CSS artesanal (`frontend/src/index.css` + estilos inline) por
un sistema real, sin reescribir la lógica de las páginas.

**Tareas**
1. Instalar Tailwind (ya estaba previsto en el plan original, Fase 7 vieja) +
   una librería de componentes headless (shadcn/ui recomendado: son
   componentes copiados al repo, no una dependencia pesada — no viola la
   regla de "nada de dependencias pesadas sin justificación").
2. Definir tokens de marca: paleta, tipografía, espaciado, radios — un solo
   archivo de configuración, no valores sueltos por componente.
3. Componentes base reutilizables: Button, Input, Select, Card, Table, Badge,
   Toast/notificación, Modal, Skeleton de carga.
4. Migrar `LoginPage` primero (es la puerta de entrada y ya tiene tests) como
   prueba de patrón, después el resto: `DashboardPage`, `LeadsPage`,
   `LeadDetailPage`, `AgendaPage`, `CallQueuePage`, `PeoplePage`, `AppLayout`.
5. Estados de carga/error/vacío en cada vista (hoy probablemente ausentes).
6. Responsive: el dashboard tiene que usarse desde celular (el asesor
   inmobiliario lo va a mirar en la calle).

**Criterios de aceptación**
- Cero `style={{...}}` inline sobreviviente en `frontend/src/routes/`.
- Todas las rutas migradas, tests de frontend existentes siguen en verde.
- Verificación manual en viewport mobile (375px) sin scroll horizontal ni
  elementos cortados.

---

## Fase B2 — Bandeja de leads: toma manual de la conversación

Depende de Fase B (usa los mismos componentes base: Card, Button, Input,
Badge, Toast). Es la feature que le da al asesor control real sobre la
conversación sin perder al agente de IA como default.

**Tareas — backend**
1. Campo de modo por lead (`assistantEnabled: boolean` o reusar/extender el
   estado `HUMAN_HANDOFF` existente en la FSM) — mientras esté en falso, el
   pipeline no invoca al LLM ni al FSM para ese lead, solo persiste los
   mensajes entrantes.
2. `POST /admin/leads/:id/send`: envía texto vía `MessagingService.sendText`
   (el mismo cliente de Meta que usa el bot), persiste `Message` OUT con
   `sentBy: human` y el `userId` del asesor que lo mandó, y pone el lead en
   modo manual automáticamente si no lo estaba.
3. `POST /admin/leads/:id/release`: ya existe para el timeout de 48hs de
   `HUMAN_HANDOFF` — reusarlo (o extenderlo) como el botón "devolver al
   agente IA", vuelve el lead a `assistantEnabled: true` y al estado de FSM
   que corresponda según el contexto (no siempre `QUALIFICATION` — si ya
   había propiedades mostradas, retomar desde ahí).
4. Verificar ventana de servicio de 24hs de Meta antes de habilitar el envío
   manual: si pasaron más de 24hs desde el último mensaje entrante del lead,
   el endpoint debe rechazar el texto libre y avisar que hace falta un
   template aprobado (no dejar que el asesor mande algo que Meta va a
   rechazar silenciosamente).
5. Respetar opt-out: si el lead está `OPTED_OUT`, el endpoint de envío
   manual también debe bloquear (nadie le escribe, ni bot ni humano).

**Tareas — frontend (foco visual, esto es lo que va a usar el asesor todo el día)**
1. Vista de chat en `LeadDetailPage`: burbujas de mensaje diferenciadas por
   emisor (lead / bot / humano — tres estilos visuales distintos, no solo
   texto plano), orden cronológico, transcripciones de audio visibles.
2. Toggle claro y siempre visible del modo actual del lead ("🤖 Agente IA
   activo" vs "🧑 Respondiendo vos") — tiene que ser imposible no darse
   cuenta en qué modo está antes de escribir.
3. Al escribir y mandar el primer mensaje manual, cambio de modo automático
   con confirmación visual (toast + cambio de color del header del chat).
4. Botón "Devolver al agente IA" con confirmación (evitar tocarlo por
   error y que el bot le escriba algo fuera de contexto a mitad de una
   conversación delicada).
5. Indicador de ventana de 24hs (ej. "quedan 3hs para responder libremente")
   para que el asesor no se encuentre con el rechazo del backend sin
   entender por qué.
6. En `LeadsPage` (bandeja general): badge por lead mostrando si está en
   modo IA o manual, para poder priorizar de un vistazo cuáles necesitan
   atención humana.

**Criterios de aceptación**
- Mensaje manual enviado desde el dashboard llega al lead por WhatsApp y
  queda persistido igual que uno del bot (mismo modelo `Message`).
- Mientras el lead está en modo manual, el bot no le responde aunque el
  lead escriba (test explícito).
- Botón de release devuelve el control al bot y el siguiente mensaje del
  lead sí dispara la FSM.
- Envío fuera de la ventana de 24hs → rechazado con mensaje explicativo,
  no falla silenciosamente contra la API de Meta.
- Mensaje a un lead `OPTED_OUT` → rechazado en el backend, sin llegar a
  Meta.
- Revisión visual: un asesor sin contexto técnico entiende en qué modo
  está el lead con solo mirar la pantalla, sin leer documentación.

---

## Fase C — Onboarding de tenant sin tocar código

Hoy dar de alta una inmobiliaria nueva probablemente requiere intervención
manual/DB. Para vender en serie hace falta que un comercial lo pueda hacer.

**Tareas**
1. Wizard de alta de tenant en el admin: datos de la inmobiliaria, conexión
   del número de WhatsApp (guía paso a paso de Meta Business), carga inicial
   de propiedades (reusar el import CSV de `admin/properties/import`).
2. Pantalla de estado de conexión de WhatsApp (webhook verificado sí/no,
   último mensaje recibido) para que el cliente vea que "está vivo".
3. Página de configuración por tenant: `alertPhone`, mensaje de bienvenida,
   horario de atención humana, template de handoff.

**Criterios de aceptación**
- Un tenant nuevo se puede dar de alta y dejar operativo sin `psql` ni
  Railway CLI, solo desde el navegador.
- Test e2e: alta de tenant → import CSV → webhook de ese tenant responde.

---

## Fase D — Hardening para producción multi-cliente

Con un solo tenant demo, errores quedan contenidos. Con clientes reales
pagando, hay que endurecer.

**Tareas**
1. Refresh tokens o al menos aviso de expiración de sesión antes de que el
   usuario pierda trabajo en el dashboard.
2. Monitoreo: alerta cuando un tenant deja de recibir webhooks (posible token
   de Meta vencido/revocado), alerta de fallos de STT/LLM repetidos.
3. Backups automáticos de Postgres (Railway ya lo ofrece — confirmar que está
   activado y probar una restauración).
4. Página de estado/logs accesible para soporte (sin exponer datos de otros
   tenants) para diagnosticar reclamos de clientes sin entrar a Railway.
5. Rate limiting y cuotas por tenant (evitar que un tenant con bug/abuso tumbe
   el LLM budget de todos).

**Criterios de aceptación**
- Restauración de backup probada al menos una vez, documentada.
- Alerta de "tenant sin actividad de webhook > X horas" disparada en un test
  manual (desconectar un número de prueba y verificar que avisa).

---

## Fase E — Lo comercial (no es código, pero bloquea la venta)

**Tareas**
1. Landing/página de precios (puede vivir fuera de este repo).
2. Política de privacidad y términos acordes a Ley 25.326 (el aviso del
   primer mensaje ya existe en el bot; falta la página legal completa).
3. Definir plan de precios y métricas que vas a mostrarle al cliente en
   `GET /admin/metrics` como argumento de venta (leads atendidos, tiempo de
   respuesta, citas agendadas).
4. Material de onboarding para el cliente (cómo conectar su WhatsApp Business,
   qué esperar).

**Criterios de aceptación**
- Checklist legal revisado (aunque sea por vos, no hace falta abogado para el
  piloto, pero sí para escalar).
- Métricas de valor visibles y entendibles por un no-técnico en el dashboard.

---

## Fase F — Piloto con cliente real

**Tareas**
1. Elegir 1 inmobiliaria piloto, onboarding completo con el flujo de Fase C.
2. Acompañamiento cercano las primeras 2 semanas (ver logs, ajustar prompts,
   corregir barrios no reconocidos, etc.).
3. Recolectar feedback estructurado: qué preguntó el bot mal, qué propiedades
   no encontró, qué UI del dashboard no entendió.
4. Con eso, priorizar el backlog de Fase 7 de `04-PLAN-FASES.md`
   (re-engagement, Tokko, Calendly, etc.) según lo que el piloto realmente pida.

**Criterios de aceptación**
- Piloto usando el sistema en producción sin intervención manual diaria tuya.
- Documento de aprendizajes del piloto que alimenta el próximo plan de fases.

---

## Orden recomendado

A → B → B2 y C en paralelo (toma manual y onboarding no se pisan) → D → E → F.
B2 depende de B (reusa sus componentes), por eso va después y no en paralelo.
No hagas D (hardening multi-cliente) antes de tener al menos un tenant real
en camino: es esfuerzo que no rinde hasta que hay algo que proteger.
