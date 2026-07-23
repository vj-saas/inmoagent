# Spec A.2: Frontend base

## Contexto

El backend (`agente-inmo`) ya expone, protegidos por `TenantApiKeyGuard`, los
endpoints de lectura/gestión de `leads` (`GET /admin/tenants/:tenantId/leads`,
`GET /admin/tenants/:tenantId/leads/:leadId/messages`, `POST .../release`,
`DELETE .../:leadId`), `properties` (`GET`, `POST`, `PATCH`, `PATCH .../status`,
`DELETE`, `POST .../import`) y `metrics` (`GET /admin/tenants/:tenantId/metrics`).
Con A.1 (`specs/A1-auth-personas`) ya terminado existe, además, autenticación de
personas humanas: `POST /auth/login` devuelve un token de sesión opaco, `POST
/auth/logout` lo invalida, y `PersonSessionGuard` + `TenantScopeGuard` +
`OwnerRoleGuard` protegen los endpoints de gestión de personas
(`admin/tenants/:tenantId/people/*`).

Hoy no existe ninguna interfaz web: para ver un lead o una métrica hay que hacer
`curl` con una API key. La inmobiliaria no tiene forma de operar el sistema. El
plan de producto (`docs/08-PROXIMOS-PASOS.md`, Fase A) identifica el panel web
como el desbloqueante comercial: sin él no hay venta. Esta spec (A.2) es el
primer paso de esa fase: construir la base del frontend — login, layout,
sesión, y la capa de consumo de la API — sobre la cual A.3/A.4/A.5 van a
construir las pantallas de negocio (bandeja de leads, ficha del lead,
dashboard).

Este spec NO define esas pantallas de negocio. Define únicamente la
infraestructura de frontend que las va a sostener: que una persona pueda
entrar con su email/password, quede autenticada, vea un layout de navegación
acorde a su rol, y que exista una capa que sepa hablar con el backend (login,
logout, y — sujeto a la pregunta abierta de esta spec — los endpoints admin
existentes) manejando los estados de carga y error de forma consistente.

## Alcance

- Un proyecto de frontend nuevo (repositorio o carpeta separada del backend,
  a definir por el `planner`), en español para toda la UI visible al usuario.
- Pantalla de login: formulario de email + contraseña, que invoca el login de
  personas ya existente y persiste la sesión resultante en el cliente.
- Pantalla o mecanismo de logout accesible desde el layout autenticado, que
  invoca el logout existente y limpia la sesión del cliente.
- Manejo de sesión en el frontend:
  - Mientras no hay sesión válida, cualquier ruta protegida redirige a login.
  - Con sesión válida, las rutas protegidas se muestran sin pedir login de
    nuevo mientras la sesión no expire o se invalide.
  - Si el backend responde 401 en cualquier llamada autenticada (sesión
    expirada, invalidada, o inexistente), el frontend limpia la sesión local y
    redirige a login.
- Layout base para el área autenticada: navegación (o su placeholder) que
  distingue lo que puede ver un rol `OWNER` (incluye gestión de personas) de
  lo que puede ver un rol `AGENT` (no la incluye), reflejando la restricción
  ya impuesta por el backend (`OwnerRoleGuard`) — el frontend oculta, el
  backend sigue siendo la autoridad de si la acción se permite o no.
- Una capa de cliente HTTP centralizada para llamar a la API del backend, que:
  - agrega el token de sesión a cada request autenticado,
  - expone de forma uniforme los estados de carga (pendiente), éxito y error
    de cada llamada,
  - distingue al menos los casos: error de red/backend caído, 401 (sesión
    inválida), 403 (rol insuficiente), 404, y error de validación (400).
- Consumo real, desde esta capa, de los endpoints ya existentes de
  autenticación de personas (`POST /auth/login`, `POST /auth/logout`) y de
  gestión de personas (`GET/POST /admin/tenants/:tenantId/people`, endpoints
  de desactivar y resetear contraseña).
- **Backend:** extender los controllers de `leads`, `metrics` y `properties`
  para aceptar también `PersonSessionGuard` + `TenantScopeGuard` (análogo al
  patrón ya usado en `people`), de forma aditiva: la `TenantApiKeyGuard`
  sigue funcionando para integraciones servidor-a-servidor, pero una persona
  con sesión válida ya no necesita una API key de tenant para consultar estos
  endpoints. Esto habilita que A.3/A.4/A.5 consuman estos endpoints desde el
  frontend sin manejar la API key en el navegador. Decisión arquitectónica
  tomada: se descarta el proxy backend-for-frontend por agregar
  infraestructura nueva sin resolver la causa (igual haría falta resolver
  quién autoriza al proxy en nombre de la persona).
- Estados visibles de carga y de error genéricos (spinner o equivalente,
  mensaje de error legible en español) reutilizables en cualquier pantalla que
  A.3/A.4/A.5 construyan después.

## Fuera de alcance

- Bandeja de leads con filtros, búsqueda y chips de operación/barrio/
  presupuesto/ambientes (Fase A.3).
- Ficha del lead: timeline de conversación, notas, cambio de estado manual,
  liberar handoff, suprimir (Fase A.4).
- Dashboard visual de métricas con tarjetas y selector de rango de fechas
  (Fase A.5). A.2 no muestra ningún dato de negocio (leads, propiedades,
  métricas) en pantalla; solo deja la capa de cliente lista para que esas
  fases la usen.
- CRUD de propiedades en UI (alta con formulario, subida de fotos, import
  CSV): eso es de Fase C (onboarding) o de spec propia si se prioriza antes.
- Cualquier cambio al backend NestJS existente. Si durante A.2 se detecta que
  falta un endpoint, o que un endpoint existente no puede ser llamado de forma
  segura desde un navegador (ver preguntas abiertas), eso se documenta como
  spec de backend separada, no se resuelve dentro de A.2.
- Recuperación de contraseña autogestionada, 2FA o SSO (ya descartados en A.1).
- Internacionalización / soporte multi-idioma: todo en español fijo.
- Tema oscuro, accesibilidad AA completa, o cualquier requisito visual más
  allá de "usable y en español" — pulido visual queda para iteración
  posterior.

## Criterios de aceptación (EARS)

**AC-1.** WHEN una persona no autenticada abre cualquier ruta del área
protegida del frontend THE SYSTEM SHALL redirigirla a la pantalla de login sin
mostrar contenido de esa ruta.

**AC-2.** WHEN una persona envía email y contraseña válidos en el formulario
de login THE SYSTEM SHALL invocar el login de personas del backend, y si la
respuesta es exitosa, persistir la sesión resultante en el cliente y navegar
al área autenticada.

**AC-3.** IF el backend responde con error (credenciales inválidas, rate
limit, u otro) al intentar login THEN THE SYSTEM SHALL mostrar un mensaje de
error legible en español en la propia pantalla de login, sin navegar al área
autenticada y sin persistir ninguna sesión.

**AC-4.** WHILE una llamada de login está en curso, THE SYSTEM SHALL mostrar
un estado de carga en el formulario y deshabilitar el reenvío del mismo
formulario hasta que la llamada anterior resuelva.

**AC-5.** WHEN una persona autenticada aciona la opción de cerrar sesión THE
SYSTEM SHALL invocar el logout del backend, eliminar la sesión persistida en
el cliente, y redirigir a la pantalla de login.

**AC-6.** WHEN cualquier llamada autenticada a la API del backend responde
401 THE SYSTEM SHALL eliminar la sesión persistida en el cliente y redirigir a
la pantalla de login, sin importar en qué pantalla del área autenticada haya
ocurrido.

**AC-7.** WHEN una persona con sesión válida y rol `OWNER` entra al área
autenticada THE SYSTEM SHALL mostrar en la navegación la opción de gestión de
personas del tenant.

**AC-8.** WHEN una persona con sesión válida y rol `AGENT` entra al área
autenticada THE SYSTEM SHALL NO mostrar en la navegación la opción de gestión
de personas del tenant.

**AC-9.** IF una persona con rol `AGENT` accede directamente (por URL) a una
pantalla de gestión de personas y el backend responde 403 THEN THE SYSTEM
SHALL mostrar un mensaje de error de permisos, sin exponer datos de otras
personas del tenant.

**AC-10.** WHEN una persona con sesión con rol `OWNER` solicita el listado de
personas de su tenant desde la pantalla correspondiente THE SYSTEM SHALL
invocar el endpoint de listado existente y mostrar el resultado devuelto por
el backend, sin inventar ni completar datos que el backend no devolvió.

**AC-11.** WHEN una persona con rol `OWNER` crea una nueva persona desde el
frontend con datos válidos THE SYSTEM SHALL invocar el endpoint de alta
existente y, si el backend devuelve una contraseña temporal en la respuesta,
mostrarla una única vez en pantalla de forma que la persona pueda copiarla
antes de continuar.

**AC-12.** IF el backend rechaza la creación de una persona (por ejemplo,
email duplicado, 409) THEN THE SYSTEM SHALL mostrar el motivo del rechazo de
forma legible, sin crear ninguna fila localmente ni asumir éxito.

**AC-13.** WHILE cualquier llamada a la API del backend está en curso, THE
SYSTEM SHALL mostrar un estado de carga distinguible en la pantalla que la
originó.

**AC-14.** IF una llamada a la API del backend falla por error de red o el
backend no responde THEN THE SYSTEM SHALL mostrar un mensaje de error
genérico distinto del de credenciales inválidas o permisos insuficientes.

**AC-15.** THE SYSTEM SHALL enviar el token de sesión vigente en cada llamada
autenticada a la API del backend, sin requerir que cada pantalla lo maneje de
forma individual.

**AC-16.** THE SYSTEM SHALL persistir la sesión de forma que, al recargar la
página estando aún vigente, la persona siga viendo el área autenticada sin
tener que loguearse de nuevo.

**AC-17.** WHEN una persona con sesión válida (rol `OWNER` o `AGENT`) invoca
`GET /admin/tenants/:tenantId/leads`, `.../metrics` o `.../properties` sin
enviar API key de tenant THE SYSTEM SHALL autorizar la petición en base a la
sesión y devolver únicamente datos del tenant de esa persona.

**AC-18.** WHEN una integración externa invoca los mismos endpoints con una
API key de tenant válida y sin sesión de persona THE SYSTEM SHALL seguir
autorizando la petición como lo hace hoy (la extensión es aditiva, no
reemplaza `TenantApiKeyGuard`).

**AC-19.** IF una persona con sesión válida de un tenant A invoca estos
endpoints con `tenantId` de un tenant B THEN THE SYSTEM SHALL rechazar la
petición (403), sin devolver datos de B.

**AC-20.** WHEN una persona con sesión válida invoca `GET /auth/me` THE SYSTEM
SHALL devolver su `id`, `role`, `tenantId` y `email`, sin requerir ni alterar
el contrato de `POST /auth/login`.

## Preguntas abiertas / decisiones pendientes

1. **RESUELTO (aprobado por el usuario, 2026-07-23):** los endpoints de
   negocio (`leads`, `metrics`, `properties`), hoy protegidos solo por
   `TenantApiKeyGuard`, se extienden de forma aditiva para aceptar también
   `PersonSessionGuard` + `TenantScopeGuard`, igual que `people`. Se descartó
   el proxy backend-for-frontend por agregar infraestructura sin resolver la
   causa. Ver criterios AC-17 a AC-19 y el ítem correspondiente en "Alcance".
2. **Stack de frontend (Next.js App Router vs. Vite + React).** El plan
   (`docs/08-PROXIMOS-PASOS.md`) deja ambas opciones abiertas. No es un
   criterio de aceptación observable por tests de producto, así que se deja
   a criterio del `planner`, que debe justificar la elección (SSR/SEO no
   aplica a un panel interno logueado; puede pesar más la velocidad de
   desarrollo o la familiaridad del equipo).
3. **Mecanismo de persistencia de la sesión en el cliente** (localStorage vs.
   cookie httpOnly vs. memoria + refresh silencioso). Afecta AC-16
   (persistencia ante reload) y tiene implicancias de seguridad (XSS) que el
   `planner` debe explicitar y justificar, dado que la sesión ya es un
   secreto sensible (token opaco de `PersonSessionGuard`).
