# Spec V-D: Portal de gestión de propiedades

## Contexto

Hoy la única forma de cargar o modificar el inventario de una inmobiliaria es
el import CSV (`POST admin/tenants/:tenantId/properties/import`, dentro del
wizard de onboarding — spec V-C) o intervención directa sobre la base de
datos. El backend de CRUD ya existe completo y probado
(`src/admin/properties/admin-properties.controller.ts`,
`properties-admin.service.ts`): listado paginado, alta, baja, edición y
cambio de estado, todos filtrados por `tenantId` y protegidos por
`PersonOrApiKeyGuard` (cadena `PersonSessionGuard → TenantScopeGuard`, sin
`OwnerRoleGuard`). El cliente HTTP del frontend también existe como stub sin
usar (`frontend/src/api/endpoints.ts`, funciones `listProperties`,
`getProperty`, `createProperty`, `updateProperty`, `updatePropertyStatus`,
`removeProperty`, todas marcadas `TODO(A.5): implementar consumo real en la
pantalla de propiedades`). Lo que falta es exclusivamente la pantalla del
panel: hoy no existe ninguna ruta de propiedades en
`frontend/src/routes/` (el único punto de contacto es `CsvUploader` dentro
del wizard, para carga masiva única).

Esto obliga a cada alta o corrección de una propiedad (precio, fotos, estado
"vendida") a pasar por CSV completo o por el equipo técnico, lo cual no
escala para una inmobiliaria que gestiona su cartera día a día.

## Decisiones de modelado (resueltas en esta spec)

**1. Filtros del listado admin: se extiende `ListPropertiesQueryDto` para
alinearlo con los criterios que ya usa el motor de búsqueda del LLM.**

Hoy el listado admin solo filtra por `status`, `operation`, `page`
(`list-properties-query.dto.ts`), mientras que `SearchFilters`
(`property-search.service.ts`) ya filtra por `neighborhoods`, `maxPrice`,
`minRooms`. Se agregan al DTO y al `PropertiesAdminService.list` los
filtros opcionales `neighborhood` (string, normalizado igual que en el
alta/edición vía `normalizeNeighborhood`), `minPrice`/`maxPrice` (number),
`rooms` (int, coincidencia exacta — no relajado, a diferencia del motor de
búsqueda del lead que sí relaja), y `q` (string, búsqueda por coincidencia
parcial case-insensitive en `title`, para encontrar rápido una propiedad
cargada por dirección o título). `page`/`pageSize` se mantienen igual
(`PAGE_SIZE = 20` fijo, sin cambios).

**2. Permisos: tanto `OWNER` como `AGENT` pueden gestionar propiedades
(listar, crear, editar, cambiar estado, borrar).**

Criterio aplicado, comparando los dos patrones ya existentes en el panel:
`PeoplePage`/`TenantConfigPage` restringen a `OWNER` porque gestionan datos
sensibles (quién tiene acceso al sistema, credenciales de Meta); `LeadsPage`,
`AgendaPage`, `DashboardPage`, `CallQueuePage` son visibles para ambos roles
porque son herramientas operativas del trabajo diario. El inventario de
propiedades es del segundo tipo: un `AGENT` necesita poder cargar una
propiedad nueva o marcarla reservada sin depender de que el `OWNER` esté
disponible. Esto es además el comportamiento que el backend **ya**
implementa: `AdminPropertiesController` usa `PersonOrApiKeyGuard`
(`PersonSessionGuard → TenantScopeGuard`) sin encadenar `OwnerRoleGuard`,
a diferencia de `PATCH :tenantId/config` y `AdminPeopleController`, que sí
lo hacen. La nueva ruta `/propiedades` se agrega al nav de `AppLayout` sin
condicionar por `person.role`, igual que `Leads`/`Panel`/`Agenda`.

**3. Fotos: upload de archivo directo (además de pegar URL), servidas desde
un volumen persistente de Railway.**

El modelo `PropertyPhoto.url` ya es una URL pública https consumida
directamente por Meta al enviar la ficha (`CreatePropertyDto.photoUrls` ya
valida con `@IsUrl`). Decisión confirmada con el usuario: se agrega un
endpoint de upload (`multer`, dependencia estándar del ecosistema Nest, no
"pesada") que guarda el archivo en un volumen persistente de Railway
(`railway.toml` — agregar un volumen montado, ej. `/data/uploads`) y lo
sirve como estático desde el propio backend, construyendo la URL pública con
`PUBLIC_BASE_URL` (env var ya existente y usada para el webhook). El
formulario de alta/edición ofrece las dos vías —arrastrar/seleccionar un
archivo o pegar una URL ya alojada externamente— y el resultado en ambos
casos es una fila más en la lista editable de `PropertyPhoto` (agregar,
quitar, reordenar por posición, igual que antes).

Restricciones del upload, para no dejar la puerta abierta a abuso o a subir
cualquier cosa:
- Tipos aceptados: `image/jpeg`, `image/png`, `image/webp` (rechazo
  explícito de cualquier otro `mimetype`, validado por contenido real del
  archivo, no solo por extensión).
- Tamaño máximo por archivo: 5 MB (cualquier imagen de celular actual entra
  cómodo; evita llenar el volumen con archivos gigantes sin comprimir).
- Nombre de archivo generado server-side (uuid + extensión), nunca se usa el
  nombre original del archivo del usuario como parte de la ruta pública.
- El endpoint de upload queda dentro de `admin/tenants/:tenantId/properties`,
  protegido por el mismo `PersonOrApiKeyGuard` que el resto del módulo — sin
  guard nuevo, mismo aislamiento por tenant (las imágenes se guardan bajo un
  subdirectorio por `tenantId` dentro del volumen, para que un tenant no
  pueda inferir ni pisar archivos de otro por coincidencia de nombre).

Elegir Railway volume (en vez de un object storage S3-compatible) es una
decisión explícita para no sumar una cuenta/proveedor nuevo ni costo
adicional ahora; si el proyecto escala a múltiples instancias del backend
en el futuro, el disco local deja de alcanzar y hay que migrar a object
storage — anotado como limitación conocida, no como bug.

**4. Borrado: cambio de estado (`PAUSED`) es la vía primaria para sacar una
propiedad de circulación; el hard delete existente se mantiene pero se
bloquea si la propiedad tiene visitas agendadas.**

`property-search.service.ts` solo devuelve propiedades con
`status: ACTIVE` al LLM: cambiar el estado a `PAUSED` ya garantiza,
inmediatamente, que el bot deje de ofrecerla a leads nuevos o a mitad de
conversación (el backend siempre re-consulta `search_properties` contra la
DB, nunca cachea resultados largo plazo — guardrail no negociable de
`CLAUDE.md`). Por eso el formulario de la ficha de propiedad ofrece el
cambio de estado como acción principal ("Pausar", "Marcar vendida/alquilada",
"Reservar"), y el botón "Eliminar" queda como acción secundaria explícita,
con modal de confirmación.

Se detectó que `Appointment.propertyId` (`prisma/schema.prisma`) es un
`String?` **sin relación FK** a `Property` (a diferencia de
`PropertyPhoto.propertyId`, que sí tiene `onDelete: Cascade`). Esto significa
que hoy `PropertiesAdminService.remove` (hard delete real,
`prisma.property.delete`) puede dejar `Appointment.propertyId` apuntando a
un registro que ya no existe, sin ningún error — un dato huérfano y
silencioso que rompería cualquier vista de detalle de cita que intente
mostrar la propiedad. Se agrega como validación nueva (pequeña, sobre el
mismo servicio ya existente): `PropertiesAdminService.remove` verifica
primero si existe al menos un `Appointment` con ese `propertyId` para el
tenant; si existe, rechaza el borrado con 409 y un mensaje que sugiere
cambiar el estado en su lugar. Es la única adición de lógica de negocio
nueva sobre el backend existente; el resto de los endpoints se reusan tal
cual.

**5. El import CSV existente no se toca.** Sigue siendo la vía recomendada
para carga masiva inicial (dentro del wizard, spec V-C) y queda disponible
también desde esta pantalla nueva como acción complementaria ("Importar
CSV"), reutilizando el mismo `CsvUploader` y el mismo endpoint `POST
:tenantId/properties/import` sin cambios de comportamiento.

**6. Aislamiento multi-tenant.** Todos los endpoints ya cuelgan de
`admin/tenants/:tenantId/properties` y ya filtran por el `tenantId` de la
ruta a través de `TenantScopeGuard` (sesión) o `TenantApiKeyGuard` (API key),
igual que el resto de `admin/`. La pantalla nueva reusa `person.tenantId`
del `AuthContext` para construir las URLs, igual que `PeoplePage` y
`LeadsPage`; ningún filtro nuevo cruza tenants.

## Alcance

- **Backend — extensión de filtros de listado** (`list-properties-query.dto.ts`,
  `properties-admin.service.ts`):
  - Agregar filtros opcionales `neighborhood`, `minPrice`, `maxPrice`,
    `rooms`, `q` (búsqueda parcial por título) al `GET
    :tenantId/properties`, combinables entre sí y con `status`/`operation`
    ya existentes.
- **Backend — validación nueva en `remove`** (`properties-admin.service.ts`):
  - Antes de borrar, verificar si existe algún `Appointment` con ese
    `propertyId` para el tenant; si existe, rechazar con 409 en vez de
    borrar.
- **Backend — endpoint de upload de fotos** (nuevo, dentro de
  `admin/tenants/:tenantId/properties`):
  - `POST :tenantId/properties/photos` con `multer` (`multipart/form-data`),
    valida tipo real de archivo (jpeg/png/webp) y tamaño (máx. 5 MB), guarda
    en el volumen persistente bajo un subdirectorio por `tenantId` con
    nombre generado server-side, devuelve la URL pública construida con
    `PUBLIC_BASE_URL`.
  - `railway.toml`: agregar volumen persistente montado (ej. `/data/uploads`).
  - `src/main.ts` o un módulo `static`: servir ese directorio como estático.
- **Frontend — nueva ruta `/propiedades`** (`PropertiesPage.tsx`), visible en
  el nav de `AppLayout` para `OWNER` y `AGENT` (sin condicional de rol):
  - Listado paginado con filtros (operación, barrio, estado, rango de
    precio, ambientes, búsqueda por texto), tabla reusando
    `Table`/`THead`/`TBody`/`TableScroll`, estados `loading`
    (`AsyncSection` + skeleton), vacío y error (`ErrorBanner`), igual patrón
    que `PeoplePage`/`LeadsPage`.
  - Alta manual: formulario con todos los campos del modelo `Property`
    (título, descripción, operación, tipo, precio, moneda, expensas, barrio,
    ciudad, dirección, ambientes, dormitorios, baños, m², cochera, admite
    mascotas, características, link de publicación, `externalRef`
    opcional) más la lista editable de URLs de fotos (Decisión 3).
  - Edición: mismo formulario, precargado, sobre `PATCH :propertyId`.
  - Cambio de estado: control dedicado (no mezclado con el formulario de
    edición general) que llama a `PATCH :propertyId/status`.
  - Borrado: botón secundario con modal de confirmación; si el backend
    responde 409 (Decisión 4), se muestra el motivo con `ErrorBanner` sin
    remover la fila.
  - Acceso a "Importar CSV" desde esta misma pantalla, reusando
    `CsvUploader` y el endpoint de import existente sin cambios.
- **Frontend — cliente HTTP**: completar el tipado de los stubs ya
  existentes en `frontend/src/api/endpoints.ts` (`listProperties`,
  `getProperty`, `createProperty`, `updateProperty`,
  `updatePropertyStatus`, `removeProperty`) reemplazando los `Promise<unknown>`
  por tipos concretos (`Property`, `PropertyPhoto`), y extender
  `ListPropertiesQuery` con los filtros nuevos de la Decisión 1.

## Fuera de alcance

- Object storage S3-compatible (R2/S3/Cloudinary) — se usa un volumen
  persistente de Railway (Decisión 3); migrar a object storage queda como
  follow-up si el proyecto necesita escalar a múltiples instancias del
  backend.
- Edición de imagen en el navegador (recorte, compresión, rotación): el
  archivo se sube tal cual el usuario lo eligió, solo con validación de
  tipo y tamaño máximo.
- Cambios al import CSV existente (`csv-import.service.ts` se reusa tal
  cual, sin tocar su lógica de parsing/upsert).
- Cambios a `property-search.service.ts` (el motor de búsqueda del LLM), a
  la FSM o al pipeline de mensajes: esta spec es exclusivamente CRUD admin
  sobre datos ya modelados.
- Historial de cambios de precio/estado (quién cambió qué y cuándo): no se
  agrega auditoría en esta spec.
- Roles adicionales o permisos más granulares que `OWNER`/`AGENT` (ej.
  "solo puede ver, no editar"): no existen hoy en el modelo `Person` y no se
  introducen acá.
- Bulk edit (editar varias propiedades a la vez fuera del CSV) o
  duplicar/clonar una propiedad como atajo de carga.
- Reordenamiento de fotos por drag-and-drop; alcanza con mover
  arriba/abajo o reingresar el orden en el listado editable.

## Criterios de aceptación (EARS)

**AC-1.** WHEN una persona con sesión válida (`OWNER` o `AGENT`) navega a
`/propiedades` de su propio tenant THE SYSTEM SHALL mostrar el listado
paginado de propiedades de ese tenant (20 por página), sin exponer
propiedades de otros tenants.

**AC-2.** WHEN se aplican uno o más filtros (`status`, `operation`,
`neighborhood`, `minPrice`, `maxPrice`, `rooms`, `q`) en el listado THE
SYSTEM SHALL devolver solo las propiedades del tenant que cumplen todos los
filtros combinados (AND).

**AC-3.** WHEN el tenant no tiene ninguna propiedad cargada THE SYSTEM SHALL
mostrar un estado vacío distinguible del estado de carga y del estado de
error, con una llamada a la acción para crear la primera propiedad o
importar un CSV.

**AC-4.** WHEN una persona con sesión válida (`OWNER` o `AGENT`) envía el
formulario de alta con todos los campos obligatorios del modelo (`title`,
`operation`, `propertyType`, `price`, `neighborhood`) válidos THE SYSTEM
SHALL crear la propiedad para el tenant de la sesión y mostrarla en el
listado sin recargar la página completa.

**AC-5.** IF el formulario de alta se envía con un campo obligatorio faltante
o inválido (ej. `price` no positivo, `photoUrls` con una URL malformada)
THEN THE SYSTEM SHALL rechazar el envío (400) y mostrar el motivo sin crear
la propiedad.

**AC-6.** IF el alta o edición incluye un `externalRef` que ya existe para
ese tenant THEN THE SYSTEM SHALL rechazar la operación (409) mostrando un
mensaje explícito de duplicado, sin modificar la propiedad existente.

**AC-7.** WHEN una persona edita una propiedad existente y guarda cambios
válidos THE SYSTEM SHALL actualizar únicamente los campos enviados y
reflejar los valores nuevos en la ficha sin perder los campos no tocados.

**AC-8.** WHEN una persona cambia el estado de una propiedad a `PAUSED`,
`RESERVED` o `SOLD_OR_RENTED` THE SYSTEM SHALL actualizar el estado y, a
partir de ese momento, esa propiedad SHALL dejar de aparecer en los
resultados de `search_properties` para leads (comportamiento ya vigente del
motor de búsqueda, verificado end-to-end desde el formulario).

**AC-9.** WHEN una persona solicita borrar una propiedad que no tiene
ningún `Appointment` asociado y confirma en el modal THE SYSTEM SHALL
eliminar la propiedad (y sus fotos, por cascada existente) y quitarla del
listado.

**AC-10.** IF una persona solicita borrar una propiedad que tiene al menos
un `Appointment` asociado THEN THE SYSTEM SHALL rechazar el borrado (409)
con un mensaje que sugiera cambiar el estado en lugar de eliminar, sin
borrar la propiedad ni el/los `Appointment`(s).

**AC-11.** WHEN una persona agrega (por archivo o por URL), quita o reordena
fotos en el formulario de alta o edición y guarda THE SYSTEM SHALL persistir
la lista de fotos con el orden (`position`) reflejado, y esas URLs SHALL ser
las mismas que use el envío de fichas del bot al lead.

**AC-12.** IF se intenta guardar una URL de foto que no es una URL http(s)
válida THEN THE SYSTEM SHALL rechazar el guardado (400) sin persistir
ninguna foto de esa operación.

**AC-17.** WHEN una persona sube un archivo de imagen válido (jpeg/png/webp,
≤5MB) THE SYSTEM SHALL guardarlo en el volumen persistente bajo el
subdirectorio del tenant correspondiente y devolver una URL pública
(`PUBLIC_BASE_URL` + ruta) usable de inmediato como foto de la propiedad.

**AC-18.** IF se intenta subir un archivo que no es jpeg/png/webp por
contenido real (no solo por extensión), o que supera 5 MB THEN THE SYSTEM
SHALL rechazar la subida (400) sin guardar nada en el volumen.

**AC-19.** WHEN una persona del tenant A sube una foto THE SYSTEM SHALL
guardarla en una ruta que no colisiona ni es adivinable a partir de rutas
del tenant B (nombre generado server-side, subdirectorio por `tenantId`).

**AC-13.** WHEN una persona con sesión de un tenant A intenta acceder,
editar o borrar una propiedad de un tenant B (por ID conocido o
manipulación de la URL) THE SYSTEM SHALL rechazar la operación (403/404)
sin exponer ni modificar datos del tenant B.

**AC-14.** THE SYSTEM SHALL permitir tanto a `OWNER` como a `AGENT` listar,
crear, editar, cambiar estado y borrar propiedades de su propio tenant, sin
diferenciar permisos entre ambos roles (Decisión 2).

**AC-15.** WHEN una persona usa la acción "Importar CSV" desde
`/propiedades` THE SYSTEM SHALL invocar el mismo endpoint de import ya
existente y mostrar el mismo reporte de filas importadas/erróneas que hoy
muestra el wizard de onboarding, sin duplicar lógica de parsing.

**AC-16.** THE SYSTEM SHALL preservar sin cambios el comportamiento actual
de `search_properties`, la FSM de conversación y el envío de fichas al lead:
ninguna operación de esta pantalla escribe directamente sobre una
conversación en curso, solo sobre el catálogo de propiedades del tenant.
