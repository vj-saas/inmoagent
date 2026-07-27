# Spec B.4: Notificaciones push del panel web

## Contexto

Hoy la única señal hacia un asesor humano de que hay algo pendiente sobre una
cita es `LeadAlertService.notify()`, que manda un WhatsApp de plantilla al
`alertPhone` del tenant cuando `SchedulingHandler.enterScheduling` crea el
`Appointment` en `PROPOSED` (B.1, fuera de alcance de B.2: "no se toca").
Esa alerta es genérica del tenant (un número fijo), no llega al asesor
concreto que después queda `assignedUserId` de la cita (recién existe desde
B.1: se fija opcionalmente en `AppointmentsAdminService.confirm`), y no existe
ningún mecanismo para avisarle a una persona autenticada en el panel web que
tiene algo pendiente si no tiene la pestaña de `/agenda` abierta en ese
momento — tiene que entrar a mirar manualmente.

Esta spec agrega notificaciones push reales del navegador (Web Push API vía
VAPID), dentro de la PWA del panel, para dos disparadores concretos ya
identificados sobre el ciclo de vida de `Appointment`:

1. Se crea un `Appointment` nuevo en `PROPOSED` (mismo punto que ya dispara
   `LeadAlertService.notify()` en `SchedulingHandler.enterScheduling`, sin
   reemplazarlo). En este punto la cita **no tiene** `assignedUserId` — nadie
   concreto está asignado todavía.
2. Un `Appointment` pasa a tener un `assignedUserId` (hoy el único camino que
   lo fija es `AppointmentsAdminService.confirm`, con `assignedUserId`
   opcional en el body). Acá sí hay un asesor concreto identificado por `id`.

### Decisión explícita: a quién notificar en el disparador 1 (sin asignación)

El plan de producto no define enrutamiento por especialidad, zona o carga de
trabajo (no existe ese dato hoy en el modelo). Para esta primera versión, el
disparador 1 notifica a **todas las `Person` del tenant con `active = true`**
(sin distinguir `role: OWNER` de `role: AGENT` — ambos roles ya conviven en
`/agenda`, según B.2 AC-18, y ambos pueden necesitar reaccionar a un lead
recién entrado a agendar). Esto es una decisión de producto tomada acá, no una
ambigüedad a resolver por el `planner`: el enrutamiento por especialidad o
reparto de carga queda fuera de alcance como paso futuro (ver más abajo).

### Punto que requiere aprobación humana explícita antes de implementar

El aislamiento multi-tenant de este feature es **crítico** según `CLAUDE.md`:
toda query de `PushSubscription` debe ir filtrada por `tenantId`, y el
endpoint de registro/borrado debe garantizar que un asesor autenticado de un
tenant jamás pueda registrar, listar ni recibir un push cruzado con datos o
suscripciones de otro tenant. Dado que este es un pipeline crítico, **este
punto (diseño del endpoint de registro y del filtro de lectura de
suscripciones por tenant) requiere aprobación humana explícita antes de que
`planner`/`implementer` avancen**, además de la aprobación de la spec en sí.

## Alcance

- **Modelo de datos — migración de schema (Prisma, `high` por definición de
  `CLAUDE.md`):**
  - Nueva tabla `PushSubscription`: `id`, `tenantId` (`String`, sin relación
    obligatoria adicional — se guarda desnormalizado desde `Person.tenantId`
    para poder filtrar/auditar sin join, según lo charlado con el usuario),
    `personId` (`String`, FK a `Person`, `onDelete: Cascade` — si se borra la
    persona, sus suscripciones desaparecen con ella), `endpoint` (`String`,
    de la Web Push API), `p256dh` (`String`, clave pública de la suscripción),
    `auth` (`String`, secreto de la suscripción), `createdAt` (`DateTime`,
    default `now()`).
  - Un `Person` puede tener múltiples `PushSubscription` (varios
    dispositivos/navegadores registrados en paralelo).
  - `endpoint` debe ser único (una misma suscripción de navegador no se
    duplica si se vuelve a registrar); el criterio exacto de unicidad
    (`@@unique` sobre `endpoint` solo, o compuesto con `personId`) queda para
    el `planner`.
  - Índice para el filtro por `tenantId` y por `personId` (detalle de índices
    para el `planner`).

- **Backend — endpoint de registro/borrado de suscripción**, protegido con
  sesión de persona real (mismo patrón que `POST
  admin/tenants/:tenantId/leads/:leadId/send`: guard de clase
  `PersonOrApiKeyGuard` + guard de método `PersonSessionRequiredGuard`, dado
  que bajo API key no hay una `Person` concreta a la cual atribuir la
  suscripción):
  - Alta de una `PushSubscription` para la persona autenticada, recibiendo
    `endpoint`/`p256dh`/`auth` del body, asociándola a `req.person.id` y al
    `tenantId` de esa persona (nunca a un `tenantId` provisto por el cliente).
  - Baja de una `PushSubscription` propia (por `endpoint`), para poder
    desregistrar un dispositivo/navegador puntual sin afectar los demás.
  - Toda lectura, alta o baja de `PushSubscription` queda filtrada por el
    `tenantId` de la persona autenticada, y adicionalmente por `personId` en
    las operaciones de baja (una persona solo puede borrar sus propias
    suscripciones, nunca las de otra persona del mismo tenant).

- **Backend — servicio de envío de push (server-side, best-effort)**, mismo
  criterio de resiliencia que `LeadAlertService`: un fallo de envío nunca
  interrumpe ni revierte el flujo de negocio que lo disparó (creación de la
  cita, confirmación con asesor asignado), solo se loguea con contexto
  (`tenantId`, `personId` destinatario, `appointmentId`).
  - Disparador 1: al crearse un `Appointment` en `PROPOSED` (mismo punto que
    ya invoca `LeadAlertService.notify()`), se envía push a todas las
    `PushSubscription` de las `Person` activas del tenant (decisión de esta
    spec, ver Contexto).
  - Disparador 2: al fijarse o cambiar `assignedUserId` en un `Appointment`
    con un valor no nulo, se envía push únicamente a las `PushSubscription`
    de esa `Person` puntual.
  - El contenido del payload es texto breve en español, sin datos sensibles
    del lead más allá de lo mínimo para identificar la acción pendiente (ej.
    nombre del lead, no teléfono completo ni notas internas), dado que el
    canal de Web Push pasa por el navegador/OS del dispositivo y no es
    end-to-end cifrado más allá del cifrado estándar del protocolo.
  - Si una `PushSubscription` es rechazada por el proveedor push como
    expirada/inválida (410 Gone u equivalente de `web-push`), se elimina de
    la tabla para no seguir intentando enviarle (limpieza best-effort, no
    bloqueante).

- **Configuración — nuevas variables de entorno**, validadas con zod en
  `src/config/env.schema.ts` igual que el resto: `VAPID_PUBLIC_KEY`,
  `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (formato `mailto:` o URL).

- **Frontend — service worker nuevo**: registra el listener del evento
  `push` (muestra la notificación con el texto recibido) y del evento
  `notificationclick` (enfoca/abre la pestaña del panel en la vista relevante
  — ficha del lead o `/agenda` — según el `appointmentId`/`leadId` incluido
  en el payload).

- **Frontend — UI de alta de suscripción**: en el layout autenticado
  (`AppLayout` o equivalente), una sola vez por sesión/dispositivo, pide
  permiso de notificación al usuario y, si lo concede, registra la
  suscripción contra el endpoint de alta del backend. Si el usuario rechaza
  el permiso o ya lo rechazó antes, el panel sigue funcionando con
  normalidad, sin bloquear ni insistir en cada carga de página.

## Fuera de alcance

- Enrutamiento del disparador 1 (cita sin `assignedUserId`) por
  especialidad, zona o carga de trabajo del asesor: por ahora se notifica a
  todas las `Person` activas del tenant; un reparto más fino es un paso
  futuro sobre esta misma spec.
- Notificaciones push para cualquier evento que no sea la creación de un
  `Appointment` en `PROPOSED` o la asignación/cambio de `assignedUserId`
  (por ejemplo: recordatorio 24hs antes de la visita — Fase B.4 original del
  plan de producto según se nombra en B.1/B.2 fuera de alcance —, cambios de
  `status` a `CONFIRMED`/`DONE`/`CANCELLED`/`NO_SHOW`, mensajes nuevos de
  leads, opt-out, handoff).
- Preferencias de usuario para silenciar o configurar qué tipos de push
  recibir (todo o nada, activado por dispositivo).
- Notificaciones nativas de sistema operativo fuera del navegador (apps
  nativas, notificaciones por email o SMS).
- Reemplazo o modificación de `LeadAlertService` (WhatsApp al tenant): sigue
  funcionando exactamente igual, sin cambios de esta spec.
- Métricas o dashboard sobre entrega/apertura de notificaciones push.
- Reintentos automáticos de envío ante fallo transitorio del proveedor push
  (best-effort simple: se intenta una vez, se loguea si falla).
- Cualquier UI de gestión de dispositivos/suscripciones registradas (ver
  lista, revocar desde otro dispositivo) más allá de que cada dispositivo
  pueda desregistrarse a sí mismo.

## Criterios de aceptación (EARS)

**AC-1.** WHEN una persona con sesión válida concede permiso de notificación
en el panel THE SYSTEM SHALL registrar una `PushSubscription` asociada a
`personId` de esa persona y al `tenantId` de esa persona (nunca a un
`tenantId` distinto, aunque el cliente lo envíe).

**AC-2.** IF una persona ya rechazó o no concede el permiso de notificación
THEN THE SYSTEM SHALL continuar operando el panel con normalidad, sin
bloquear ninguna funcionalidad existente.

**AC-3.** WHEN una persona con sesión válida invoca el endpoint de baja de
`PushSubscription` para un `endpoint` que le pertenece THE SYSTEM SHALL
eliminar esa suscripción.

**AC-4.** IF una persona con sesión válida del tenant A invoca el endpoint de
baja de `PushSubscription` sobre un `endpoint` que pertenece a una `Person`
de otro tenant, o a otra `Person` del mismo tenant, THEN THE SYSTEM SHALL
rechazar la operación sin eliminar esa suscripción.

**AC-5.** IF el endpoint de alta o baja de `PushSubscription` se invoca sin
una sesión de persona válida (por ejemplo, autenticado solo con API key de
tenant) THEN THE SYSTEM SHALL rechazar la petición (403), dado que no hay una
`Person` concreta a la cual atribuir la suscripción.

**AC-6.** WHEN se crea un `Appointment` nuevo en estado `PROPOSED` THE SYSTEM
SHALL intentar enviar una notificación push a toda `PushSubscription`
asociada a una `Person` activa (`active = true`) del mismo tenant que el
`Appointment`.

**AC-7.** WHEN un `Appointment` pasa a tener un `assignedUserId` no nulo (ya
sea al crearse con ese valor o al actualizarse) THE SYSTEM SHALL intentar
enviar una notificación push únicamente a las `PushSubscription` asociadas a
esa `Person` puntual, sin notificar al resto de personas del tenant por ese
evento.

**AC-8.** IF el envío de una notificación push falla por cualquier motivo
(error de red, credenciales VAPID inválidas, suscripción rechazada por el
proveedor) THEN THE SYSTEM SHALL registrar el error en el log con contexto
(`tenantId`, `personId` destinatario, `appointmentId`) sin interrumpir ni
revertir la creación o actualización del `Appointment` que disparó el envío.

**AC-9.** IF el proveedor de push responde que una `PushSubscription` ya no
es válida (por ejemplo, código de expiración/gone) THEN THE SYSTEM SHALL
eliminar esa suscripción de la base de datos, sin afectar el resto de
suscripciones de esa u otras personas.

**AC-10.** THE SYSTEM SHALL redactar el texto de toda notificación push
enviada en español, sin incluir en el payload datos del lead más allá de los
mínimos necesarios para identificar la acción pendiente (nunca el teléfono
completo del lead, notas internas ni datos de otras propiedades/leads no
relacionados).

**AC-11.** WHEN una persona hace click en una notificación push recibida THE
SYSTEM SHALL abrir o enfocar una pestaña del panel en la vista relevante para
esa notificación (ficha del lead o agenda correspondiente al
`appointmentId`/`leadId` incluido).

**AC-12.** THE SYSTEM SHALL NOT permitir que una consulta de
`PushSubscription` (lectura, alta o baja) devuelva o modifique registros
cuyo `tenantId` sea distinto del `tenantId` de la persona autenticada que
realiza la operación, preservando el aislamiento multi-tenant vigente en todo
el resto del panel.

**AC-13.** IF faltan o son inválidas las variables de entorno
`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` o `VAPID_SUBJECT` al arrancar la
aplicación THEN THE SYSTEM SHALL fallar el arranque indicando cuál falta o es
inválida, igual que el resto de las variables validadas en
`src/config/env.schema.ts`.

**AC-14.** THE SYSTEM SHALL preservar sin cambios el comportamiento existente
de `LeadAlertService.notify()` (alerta por WhatsApp al `alertPhone` del
tenant): esta spec agrega el envío de push en paralelo, sin reemplazar,
condicionar ni modificar ese mecanismo existente.

## Preguntas abiertas

- El diseño concreto del endpoint de registro/borrado de `PushSubscription` y
  del filtrado por `tenantId` (AC-1 a AC-5, AC-12) requiere aprobación humana
  explícita antes de pasar a `planner`, por tratarse de una superficie
  clasificada como crítica (aislamiento multi-tenant) según `CLAUDE.md`.
- Criterio exacto de unicidad de `endpoint` en la tabla `PushSubscription`
  (`@@unique` simple vs. compuesto con `personId`): se deja para que lo
  resuelva `planner`, no es una decisión de producto sino de modelado.
