# Spec A.1: Autenticación de personas y roles

## Contexto

Hoy el sistema solo tiene autenticación de máquina: una `ADMIN_MASTER_KEY` para
operaciones de plataforma (alta de tenants, vía `MasterKeyGuard`) y una API key
por tenant hasheada con argon2 para integraciones (`TenantApiKeyGuard`). No
existe ningún concepto de usuario humano, sesión ni rol.

El plan de producto (`docs/08-PROXIMOS-PASOS.md`, Fase A) requiere construir un
panel web para que los empleados de cada inmobiliaria (el "tenant") puedan ver
sus leads, su agenda y gestionar su cuenta. Esa fase (A.2 en adelante) necesita
que exista, antes que nada, una forma de que una persona (no una integración)
se identifique ante el sistema, que el sistema sepa a qué tenant pertenece esa
persona y qué puede hacer según su rol.

Este spec cubre exclusivamente esa base de autenticación y autorización de
personas (Fase A.1). No cubre ningún frontend ni ninguna pantalla: es
puramente el contrato de backend que A.2 va a consumir.

Dado que este trabajo toca aislamiento multi-tenant — clasificado como
**crítico e innegociable** en `CLAUDE.md` — cualquier ambigüedad se deja
explícita como pregunta abierta al final de este documento, para aprobación
humana antes de pasar a la fase de planificación.

## Alcance

- Un usuario humano ("persona") pertenece a exactamente un tenant, se
  identifica con email + contraseña, y tiene un rol: `OWNER` o `AGENT`.
  - `OWNER`: puede ver y gestionar todos los datos de su tenant, y además
    gestionar las cuentas de otras personas de su mismo tenant (alta, listado,
    baja).
  - `AGENT`: puede ver/operar los datos de su tenant (leads, agenda, etc. —
    cubiertos por specs posteriores de A.3/A.4), pero no puede gestionar
    cuentas de personas.
- La contraseña se almacena únicamente como hash (argon2, igual que ya se hace
  hoy con `apiKeyHash` del tenant). Nunca se persiste ni se loguea en texto
  plano.
- El email de cada persona es único a nivel global del sistema (no solo dentro
  de su tenant) y se normaliza a minúsculas antes de guardarse/consultarse,
  para que el login pueda resolver a qué tenant pertenece sin pedir el tenant
  explícitamente.
- Endpoint de login público (sin tenant en la ruta): recibe email + password,
  y si son válidos y la cuenta y el tenant están activos, entrega una sesión.
  El mecanismo concreto de sesión (JWT vs. cookie de servidor) es una decisión
  pendiente — ver "Preguntas abiertas".
- Endpoint de logout: una persona autenticada puede cerrar su sesión de forma
  explícita, sin esperar a que expire.
- Un guard nuevo, separado del `TenantApiKeyGuard` existente, que resuelve la
  persona autenticada y su tenant a partir de la sesión, para proteger
  endpoints pensados para personas (a diferencia del guard de API key, pensado
  para integraciones de máquina). Ambos guards coexisten; el de API key no se
  toca ni se reemplaza en este spec.
- Alta del primer `OWNER` de un tenant: mediante un endpoint de "bootstrap"
  protegido por la master key existente (la misma que ya protege el alta de
  tenants), utilizable solo si ese tenant todavía no tiene ningún owner activo.
- Gestión básica de personas por un `OWNER`: listar las personas de su propio
  tenant, crear una nueva persona (`AGENT` u `OWNER`) para su propio tenant, y
  desactivar una persona de su propio tenant.
- Aislamiento estricto: cualquier operación de los puntos anteriores queda
  acotada exclusivamente al tenant resuelto desde la sesión de quien hace el
  pedido. Un usuario de un tenant jamás accede ni afecta datos de otro tenant,
  sin excepción.

## Fuera de alcance

- Frontend/UI del panel (eso es la Fase A.2).
- Recuperación de contraseña por email (hoy no hay infraestructura de envío de
  emails en el stack; se pospone).
- Cambio de contraseña autogestionado por la propia persona autenticada, y
  recuperación de contraseña por email. **Decidido:** si una persona pierde su
  contraseña, el `OWNER` de su tenant la regenera (ver AC-23). No hace falta
  infraestructura de email para este spec.
- 2FA y SSO: no se justifican para un MVP de panel interno de una sola
  inmobiliaria por tenant.
- Migrar los endpoints admin existentes (`leads`, `properties`, `metrics`,
  `appointments`, tenants) para exigir el nuevo guard de personas. Hoy siguen
  protegidos por `TenantApiKeyGuard`/`MasterKeyGuard` tal cual están; conectar
  el panel a esos endpoints con el guard de personas es trabajo de A.3/A.4.
- Límite de cantidad de personas por tenant, o cualquier lógica de facturación
  por asiento.
- Auditoría de accesos más allá de los logs estructurados que ya existen hoy
  (pino con `tenantId`).

## Criterios de aceptación (EARS)

**AC-1.** THE SYSTEM SHALL asociar cada persona a exactamente un tenant, con
email, hash de contraseña (argon2), rol (`OWNER` o `AGENT`) y un estado
activo/inactivo.

**AC-2.** THE SYSTEM SHALL almacenar el email de cada persona normalizado en
minúsculas, con unicidad garantizada a nivel global del sistema (no solo por
tenant).

**AC-3.** THE SYSTEM SHALL almacenar la contraseña de cada persona
exclusivamente como hash argon2; en ningún caso queda persistida ni logueada
en texto plano.

**AC-4.** IF se intenta crear una persona con una contraseña de menos de 8
caracteres THEN THE SYSTEM SHALL rechazar la operación (400) sin crear el
registro.

**AC-5.** WHEN se invoca el endpoint de bootstrap del primer owner de un
tenant con la master key válida, y ese tenant todavía no tiene ningún owner
activo, THE SYSTEM SHALL crear la persona con rol `OWNER` en estado activo
asociada a ese tenant.

**AC-6.** IF se invoca el bootstrap de primer owner para un tenant que ya
tiene al menos un owner activo THEN THE SYSTEM SHALL rechazar la operación
(409) sin crear un nuevo registro.

**AC-7.** IF se invoca cualquier endpoint de gestión de personas (bootstrap,
alta, listado, baja) sin una master key válida o sin una sesión de persona
válida (según corresponda al endpoint) THEN THE SYSTEM SHALL responder 401 sin
ejecutar ninguna acción sobre la base de datos.

**AC-8.** WHEN se envían email y password que coinciden con una persona
activa, cuyo tenant también está activo, THE SYSTEM SHALL responder con una
sesión válida (200), sin exponer en ningún campo de la respuesta el hash de la
contraseña.

**AC-9.** IF el email no corresponde a ninguna persona registrada, o la
contraseña no coincide, o la persona está inactiva, THEN THE SYSTEM SHALL
responder 401 con un mensaje de error genérico que no permita distinguir cuál
de esas tres condiciones ocurrió.

**AC-10.** IF el tenant asociado a la persona tiene su bandera de activo en
`false` THEN THE SYSTEM SHALL rechazar el login con 401, usando el mismo
mensaje genérico que en AC-9.

**AC-11.** IF se reciben más de 10 intentos de login fallidos para el mismo
email dentro de una ventana de 15 minutos THEN THE SYSTEM SHALL rechazar
intentos adicionales para ese email durante el resto de la ventana —incluso
con credenciales correctas— respondiendo con un código distinto al de
credenciales inválidas (429).

**AC-12.** WHEN llega un request a un endpoint protegido por el guard de
personas sin una sesión válida (ausente, malformada o expirada) THE SYSTEM
SHALL responder 401 sin ejecutar la lógica del endpoint.

**AC-13.** WHEN llega un request a un endpoint protegido por el guard de
personas con una sesión válida THE SYSTEM SHALL resolver la persona
autenticada y el tenantId asociado a su sesión antes de ejecutar cualquier
lógica de negocio del endpoint.

**AC-14.** WHEN una persona autenticada con tenantId=A solicita datos o una
acción scopeada explícita o implícitamente a un tenantId=B (distinto al de su
sesión) THE SYSTEM SHALL rechazar la operación con 403, sin ejecutar ninguna
consulta ni modificación sobre datos del tenant B.

**AC-15.** WHILE la sesión de una persona está vigente, THE SYSTEM SHALL
restringir todo acceso vía el guard de personas exclusivamente a los datos y
acciones del tenantId asociado a esa sesión.

**AC-16.** IF una persona con rol `AGENT` intenta acceder a cualquier endpoint
de gestión de personas (listar, crear o desactivar) THEN THE SYSTEM SHALL
rechazar la operación con 403.

**AC-17.** WHEN una persona con rol `OWNER` solicita crear una nueva persona
(email + rol) para su propio tenant THE SYSTEM SHALL crear la cuenta en estado
activo asociada a ese mismo tenant, y devolver una contraseña inicial generada
por el sistema una única vez en la respuesta (si no se proporcionó una
explícitamente), sin que quede recuperable después de esa respuesta.

**AC-18.** IF el email indicado al crear una persona ya está en uso (en
cualquier tenant) THEN THE SYSTEM SHALL rechazar la operación con 409, sin
crear el registro.

**AC-19.** WHEN una persona con rol `OWNER` solicita el listado de personas de
su tenant THE SYSTEM SHALL devolver únicamente las personas cuyo tenantId
coincide con el de la sesión de quien pide el listado.

**AC-20.** WHEN una persona con rol `OWNER` solicita desactivar una persona de
su propio tenant THE SYSTEM SHALL marcar esa cuenta como inactiva y, desde ese
momento, rechazar tanto nuevos logins de esa cuenta como cualquier uso de una
sesión previamente emitida para ella.

**AC-21.** IF desactivar una persona dejaría al tenant sin ningún owner activo
THEN THE SYSTEM SHALL rechazar la operación (409) y mantener el estado
anterior sin cambios.

**AC-22.** WHEN una persona autenticada solicita cerrar su sesión (logout) THE
SYSTEM SHALL invalidar esa sesión, de forma que una solicitud posterior que
use el mismo token/cookie sea rechazada con 401.

**AC-23.** WHEN una persona con rol `OWNER` solicita regenerar la contraseña
de otra persona de su propio tenant THE SYSTEM SHALL reemplazar el hash
almacenado por uno nuevo, invalidar cualquier sesión previamente emitida para
esa persona, y devolver la contraseña temporal en texto plano una única vez en
la respuesta, sin que quede recuperable después.

## Decisiones tomadas (aprobadas por el owner del producto, 2026-07-23)

- **Sin reseteo de contraseña por email.** Si una persona pierde su
  contraseña, el `OWNER` de su tenant la regenera vía AC-23. No se agrega
  infraestructura de email a este spec.
- **Cualquier `OWNER` puede crear otro `OWNER`** de su mismo tenant (AC-17 sin
  restricción de rol al crear, tal como se especificó). Autoservicio total del
  cliente; no requiere intervención del proveedor salvo para el primer owner
  (bootstrap con master key, AC-5).

## Preguntas abiertas / decisiones pendientes

1. **Mecanismo de sesión (JWT vs. cookie de servidor).** Sigue abierto:
   AC-12/AC-22 (rechazo por sesión inválida/expirada, e invalidación explícita
   por logout, ahora también AC-23) son observables con cualquiera de los dos
   mecanismos, pero logout/invalidación inmediata con JWT estrictamente
   stateless requiere algún tipo de revocación (blocklist o sesión respaldada
   en DB/Redis). Queda a criterio del `planner`, que debe justificar la
   elección y garantizar que cumple AC-22 y AC-23.
2. **Duración de la sesión:** 12 horas (parámetro de referencia para el MVP;
   el `planner` puede ajustarlo si encuentra una razón técnica concreta).
3. **Rate limiting de login (AC-11):** 10 intentos fallidos / 15 minutos por
   email, reutilizando el patrón de `TenantThrottlerGuard`.
