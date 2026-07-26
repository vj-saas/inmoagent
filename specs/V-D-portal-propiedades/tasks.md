# Tasks V-D: Portal de gestión de propiedades

> Producido por `task-splitter`. Tareas atómicas derivadas de `plan.md` y de
> sus 12 "Aprobaciones pendientes" (todas confirmadas por el usuario, no se
> re-discuten acá). Vive en `specs/V-D-portal-propiedades/tasks.md`.

> Nota de clasificación (CLAUDE.md "Qué es low/medium/high" + "Qué se
> considera crítico" + tabla "Clasificación por pieza" del propio `plan.md`):
> el CRUD de `properties` (filtros del listado, validación de `Appointment`
> en `remove`, sincronización de fotos en `update`) es **medium** — CRUD y
> DTOs de `admin`/`properties` filtrado por `tenantId`, sin superficie
> crítica, mismo criterio que V-B2. El **upload de fotos** introduce una
> **segunda superficie de aislamiento multi-tenant** (el filesystem, no solo
> la DB): `PropertyPhotoStorageService` + el endpoint `POST photos` son
> **high y críticos** por la regla explícita del CLAUDE.md ("cualquier query
> o lógica que resuelva el tenant o que pueda filtrar/mezclar datos entre
> tenants"), y ante la duda se usa el nivel más alto. El servido estático
> (`useStaticAssets` + chequeo de montaje en `main.ts`) es **high** por ser
> una ruta pública nueva sin guards en un backend que hoy solo expone
> `/health` y el webhook, aunque no resuelve tenant por sí mismo. El e2e
> dedicado de upload + aislamiento (`T19`) es **high y crítico**, con archivo
> propio separado del e2e de CRUD general, siguiendo la instrucción explícita
> de darle a AC-19 su propia superficie de prueba (mismo criterio que B1/B2:
> el nivel más alto para lo que ejercita la superficie crítica). Todo lo
> demás (infra de `railway.toml`/env var/docs, fixes de tipos de una línea,
> componentes visuales de frontend sin lógica de negocio propia) es **low** o
> **medium** según corresponda.
>
> **Hallazgos del plan incorporados como tareas** (bloqueantes de AC, no son
> opcionales): hallazgo 1 → `T3` (fotos en `update`, sin lo cual AC-11 es
> inalcanzable); hallazgo 2 → `T8` (fix de `PropertyStatus`/`OperationType`
> en el frontend, sin lo cual AC-8 es inalcanzable). El hallazgo 3 (`multer`/
> `@types/multer` ya son dependencias directas) no genera tarea: no hay nada
> que instalar.
>
> **Nota de archivo compartido:** `T1`, `T2` y `T3` modifican el mismo
> archivo (`properties-admin.service.ts`) en métodos distintos (`list`,
> `remove`, `update`). No hay dependencia lógica entre ellas, pero se
> encadenan como dependencia de secuenciación pura (evitar conflicto de
> merge de tres implementers editando el mismo archivo a la vez) — se anota
> explícitamente en cada una.

## Tareas

## T1 — Filtros del listado: `ListPropertiesQueryDto` + `PropertiesAdminService.list`
- **Dificultad:** medium ← CRUD y DTO de `properties` filtrado por `tenantId`, sin superficie crítica
- **Descripción:** En `list-properties-query.dto.ts` agregar
  `neighborhood?: string` (`@IsOptional() @IsString() @MaxLength(120)`),
  `minPrice?: number` / `maxPrice?: number` (`@IsOptional() @Type(() =>
  Number) @IsNumber() @Min(0)`), `rooms?: number` (`@IsOptional() @Type(() =>
  Number) @IsInt() @Min(0)`), `q?: string` (`@IsOptional() @IsString()
  @MaxLength(120)`). En `PropertiesAdminService.list`, extender el armado del
  `where` con spreads condicionales (mismo patrón que `status`/`operation`
  ya existentes): `neighborhood` normalizado con `normalizeNeighborhood`
  antes de comparar por igualdad exacta; `minPrice`/`maxPrice` combinados en
  un único `price: { gte, lte }`; `rooms` por igualdad exacta (sin relajar);
  `q` como `title: { contains: q.trim(), mode: 'insensitive' }`, sin aplicar
  si el `trim()` queda vacío. No se toca `PAGE_SIZE` ni el `orderBy`. Extiende
  `properties-admin.service.spec.ts`: cada filtro por separado y la
  combinación de todos arma el `where` esperado; `neighborhood` con tilde y
  mayúsculas se normaliza igual que en `create`.
- **Valida:** AC-2 vía `properties-admin.service.spec.ts` (unit) y E2E 1 de
  `T18`.
- **Dependencias:** ninguna
- **Paralelizable:** sí

## T2 — `remove()`: validación de `Appointment` + `$transaction` + `findOneOrThrow` compartido
- **Dificultad:** medium ← lógica de negocio acotada sobre un service existente, sin schema nuevo
- **Descripción:** Extraer `private findOneOrThrow(client, tenantId,
  propertyId)` (la query de 404 de `getOne`, parametrizada por cliente
  Prisma/tx) y hacer que `getOne` la use vía
  `findOneOrThrow(this.prisma, ...)` sin cambiar su comportamiento externo
  (mismo 404, mismo `include`). Reescribir `remove(tenantId, propertyId)`
  como una `$transaction` interactiva: `findOneOrThrow(tx, ...)` (404) →
  `tx.appointment.findFirst({ where: { tenantId, propertyId }, select: { id:
  true } })` → si existe, `ConflictException` con el mensaje exacto del
  plan ("No se puede eliminar: la propiedad tiene visitas agendadas. Cambiá
  su estado a Pausada para sacarla de circulación.") → si no existe,
  `tx.property.delete(...)`. `where` del `findFirst` lleva `tenantId`
  explícito aunque `propertyId` ya sea único (defensa contra citas huérfanas
  de otro tenant que bloquearían un borrado legítimo). Extiende
  `properties-admin.service.spec.ts`: con `Appointment` existente →
  `ConflictException` y `property.delete` **no** invocado; sin citas →
  borra; con una cita de **otro** tenant sobre el mismo `propertyId` → borra
  igual (no debe bloquear).
- **Valida:** AC-9, AC-10 vía `properties-admin.service.spec.ts` (unit) y
  E2E 6 de `T18`.
- **Dependencias:** T1 (mismo archivo `properties-admin.service.ts`;
  secuenciación por archivo compartido, sin dependencia lógica real)
- **Paralelizable:** no

## T3 — Fotos en `update()` (hallazgo 1 del plan)
- **Dificultad:** medium ← escritura CRUD transaccional, no toca el motor de búsqueda
- **Descripción:** En `PropertiesAdminService.update`, dentro de la misma
  `$transaction` que actualiza el resto de los campos: si `dto.photoUrls ===
  undefined`, no tocar fotos (AC-7: solo se actualizan los campos enviados);
  si está presente (incluido `[]`), reemplazo completo —
  `tx.propertyPhoto.deleteMany({ where: { propertyId } })` seguido de
  `tx.propertyPhoto.createMany({ data: photoUrls.map((url, position) => ({
  propertyId, url, position })) })` (o el equivalente vía `property.update`
  con `photos: { deleteMany: {}, create: [...] }`, según lo que ya use el
  service). `photoUrls: []` borra todas las fotos (divergencia deliberada de
  `upsertByExternalRef`, que no se toca). La validación de URL sigue siendo
  la del DTO (`@IsUrl({}, { each: true })`), sin cambios nuevos. Extiende
  `properties-admin.service.spec.ts`: `update` con `photoUrls` presente
  reemplaza y respeta `position` = índice del array; con array vacío borra
  todas; sin `photoUrls` no toca fotos existentes.
- **Valida:** AC-7, AC-11, AC-12 vía `properties-admin.service.spec.ts`
  (unit) y E2E 4 de `T18`.
- **Dependencias:** T2 (mismo archivo `properties-admin.service.ts`;
  secuenciación por archivo compartido, sin dependencia lógica real)
- **Paralelizable:** no

## T4 — `image-magic-bytes.util.ts`: sniff de tipo real de archivo
- **Dificultad:** medium ← función pura sin I/O; rol de seguridad pero aislada y 100% testeable en unit
- **Descripción:** Crear `src/admin/properties/image-magic-bytes.util.ts`
  con `sniffImageType(buffer: Buffer): 'jpeg' | 'png' | 'webp' | null`: jpeg
  = `FF D8 FF`; png = `89 50 4E 47 0D 0A 1A 0A`; webp = `RIFF` en offset 0 +
  `WEBP` en offset 8 (no alcanza con `RIFF` solo, que también matchea
  WAV/AVI); cualquier otro contenido → `null`. Sin dependencias externas
  (se descarta `file-type` por justificación de `CLAUDE.md` de no sumar
  dependencias sin necesidad). Incluye `image-magic-bytes.util.spec.ts`:
  buffers mínimos válidos de jpeg/png/webp → tipo correcto; PDF, SVG, HTML,
  ZIP, buffer vacío, buffer de 3 bytes, y un `RIFF` que es WAV (no WEBP) →
  `null`; caso adversario: buffer con cabecera PNG real → detecta `png`
  independientemente del nombre/extensión que se le pase (la función no
  recibe nombre de archivo, solo el buffer).
- **Valida:** AC-18 vía `image-magic-bytes.util.spec.ts` (unit) y E2E de
  `T19`.
- **Dependencias:** ninguna
- **Paralelizable:** sí

## T5 — `PropertyPhotoStorageService` + `POST :tenantId/properties/photos`
- **Dificultad:** high (y crítico) ← resuelve el `tenantId` sobre una segunda superficie de aislamiento (filesystem): un bug de path pisa o filtra archivos entre tenants
- **Descripción:** Crear `src/admin/properties/property-photo-storage.service.ts`
  con `save(tenantId, file: { buffer: Buffer; size: number }): Promise<{
  url: string; relativePath: string }>`: (1) `assertSafeTenantId(tenantId)`
  — exige forma de cuid (`/^[a-z0-9]{20,40}$/i`), lanza si no matchea, sin
  tocar el filesystem; (2) valida `file.size` contra `MAX_PHOTO_BYTES` (5 MB,
  defensa redundante al `limits` del interceptor); (3) `sniffImageType`
  (T4) sobre el buffer → 400 si `null`; (4) genera nombre con
  `crypto.randomUUID()` + extensión derivada del tipo detectado (nunca del
  nombre original del usuario, que no se guarda en ningún lado); (5)
  `mkdir(UPLOADS_DIR/properties/<tenantId>, { recursive: true })` +
  `writeFile` de la ruta completa; (6) arma la URL pública con
  `PUBLIC_BASE_URL` (nunca con el header `Host`), normalizando la barra
  final. En `admin-properties.controller.ts`, agregar `POST
  :tenantId/properties/photos` con `FileInterceptor('file', {
  limits: { fileSize: MAX_PHOTO_BYTES } })` sin `storage` explícito
  (`memoryStorage` por default — nada toca disco antes de validar), sin
  guard nuevo (hereda `TenantThrottlerGuard` + `PersonOrApiKeyGuard` de
  clase), delegando en el service; mapea `ENOSPC` del `writeFile` a un 500
  con mensaje en español y log `error` con `tenantId`. Registrar
  `PropertyPhotoStorageService` en `providers` de `admin.module.ts`.
  Incluye `property-photo-storage.service.spec.ts` (con `UPLOADS_DIR` en un
  `tmpdir`): dos tenants suben archivos → directorios y nombres distintos,
  ninguno adivinable a partir del otro; el nombre original
  (`../../etc/passwd.jpg`) no aparece en la ruta resultante;
  `assertSafeTenantId` lanza con `../otro`, `a/b` y cadena vacía **sin
  escribir nada** en disco; la URL devuelta arranca con `PUBLIC_BASE_URL` y
  no duplica barras; `writeFile` no se invoca si el sniff o el tamaño
  rechazan el archivo.
- **Valida:** AC-17, AC-18, AC-19 vía `property-photo-storage.service.spec.ts`
  (unit) y E2E de `T19`.
- **Dependencias:** T4
- **Paralelizable:** sí

## T6 — `useStaticAssets` en `main.ts` + chequeo de montaje del volumen
- **Dificultad:** high ← ruta pública nueva sin guards, sin throttle y sin validación, en un backend que hoy solo expone `/health` y el webhook
- **Descripción:** Cambiar `NestFactory.create` a
  `NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true,
  rawBody: true })`. Agregar `app.useStaticAssets(resolve(config.get(
  'UPLOADS_DIR', { infer: true })), { prefix: '/uploads/', index: false,
  dotfiles: 'ignore', redirect: false, maxAge: '30d', immutable: true })`
  antes de `app.listen`. Al arranque: `mkdir(UPLOADS_DIR, { recursive: true
  })` (falla temprano si el punto de montaje es read-only) y, solo con
  `NODE_ENV === 'production'`, comparar `statSync(UPLOADS_DIR).dev` contra
  `statSync('/').dev`: si son iguales, loguear `error` ("UPLOADS_DIR no
  parece estar en un volumen persistente: las fotos subidas se van a perder
  en el próximo deploy") **sin abortar el boot** (el webhook con su regla de
  <1s no se tumba por esto). Verificar compatibilidad con `helmet` ya
  configurado (`crossOriginResourcePolicy: 'cross-origin'`) sin tocarlo.
  Incluye test de arranque (o unit del chequeo extraído a una función
  pura si el implementer lo prefiere aislar, ej.
  `uploads-mount-check.util.ts` + `.spec.ts`): mismo `dev` → loguea `error`
  y no lanza; distinto `dev` → no loguea nada.
- **Valida:** AC-17 (servido de la URL pública) vía E2E de `T19` (`GET` de
  la URL devuelve 200 con `Content-Type` correcto); el chequeo de montaje en
  sí, vía su propio test unitario si se extrae como función.
- **Dependencias:** T7 (necesita `UPLOADS_DIR` registrada en
  `env.schema.ts`)
- **Paralelizable:** sí

## T7 — Infra: `UPLOADS_DIR`, `railway.toml`, `.env.example`, `docs/06-DEPLOY.md`
- **Dificultad:** low ← configuración y documentación, sin lógica
- **Descripción:** En `src/config/env.schema.ts`: `+ UPLOADS_DIR:
  z.string().min(1).default('./uploads')`. En `.env.example`: `+
  UPLOADS_DIR=./uploads`. En `railway.toml`: declarar el volumen persistente
  (`[[deploy.volumes]] mountPath = "/data/uploads"`, `name = "uploads"`) —
  **si el schema de config-as-code vigente no valida ese bloque**, dejar
  `railway.toml` como está y documentar en `docs/06-DEPLOY.md` el paso
  manual equivalente (`railway volume add`, mismo mount path, 5 GB
  iniciales). `docs/06-DEPLOY.md`: agregar el paso de creación del volumen y
  la restricción operativa de **una sola réplica** mientras se use volumen
  local. `docs/02-DATOS.md`: nota menor de que `PropertyPhoto.url` puede
  apuntar al propio backend. Agregar `uploads/` a `.gitignore`.
- **Valida:** ningún AC de negocio directamente (es prerrequisito de
  despliegue de AC-17/AC-18/AC-19); se verifica por `npx prisma validate` +
  build limpio + que `T6` y `T19` puedan configurar `UPLOADS_DIR` en un
  directorio temporal para tests.
- **Dependencias:** ninguna
- **Paralelizable:** sí

## T8 — Fix de tipos `PropertyStatus`/`OperationType` en `endpoints.ts` (hallazgo 2 del plan)
- **Dificultad:** low ← corrección de tipos, sin lógica
- **Descripción:** En `frontend/src/api/endpoints.ts`, corregir
  `PropertyStatus = 'ACTIVE' | 'RESERVED' | 'SOLD_OR_RENTED' | 'PAUSED'`
  (antes `'SOLD' | 'RENTED'`, incorrectos) y `OperationType = 'SALE' |
  'RENT' | 'TEMP_RENT'` (antes faltaba `TEMP_RENT`), alineados al enum real
  de Prisma. Es un fix puntual: no se tocan las funciones que aún usan
  `Promise<unknown>` (eso es `T9`).
- **Valida:** prerrequisito directo de AC-8 (sin este fix, `RESERVED` es
  inalcanzable desde la UI y el backend rechaza con 400 los valores viejos).
  Se verifica junto con `T14`/`T16` en `PropertyStatusControl.test.tsx` y
  `LeadDetailPage`-equivalente de esta spec.
- **Dependencias:** ninguna
- **Paralelizable:** sí

## T9 — Tipado real de los stubs de `endpoints.ts` + `uploadPropertyPhoto`
- **Dificultad:** medium ← cliente HTTP con `FormData`, sin lógica de negocio propia
- **Descripción:** En `frontend/src/api/endpoints.ts`: `+ interface
  Property` (todos los campos del modelo: `title`, `description`,
  `operation`, `propertyType`, `price`, `currency`, `expenses`,
  `neighborhood`, `city`, `address`, `rooms`, `bedrooms`, `bathrooms`,
  `areaM2`, `hasGarage`, `petsAllowed`, `features`, `listingUrl`,
  `externalRef`, `status`, `photos: PropertyPhoto[]`, timestamps); `+
  interface PropertyPhoto { id: string; url: string; position: number }`;
  `+ interface ListPropertiesResponse { items: Property[]; total: number;
  page: number; pageSize: number }`; tipar `listProperties`, `getProperty`,
  `createProperty`, `updateProperty`, `updatePropertyStatus`,
  `removeProperty` reemplazando `Promise<unknown>`; extender
  `ListPropertiesQuery` con `neighborhood?`, `minPrice?`, `maxPrice?`,
  `rooms?`, `q?` (los 5 filtros de `T1`), omitiendo los vacíos al
  serializar. `+ uploadPropertyPhoto(tenantId, file: File, token):
  Promise<{ url: string }>` — arma `FormData`, la envía a `POST
  :tenantId/properties/photos` **sin** `Content-Type` manual (el navegador
  agrega el boundary; `http-client` ya soporta `FormData` desde V-C).
  Extiende `endpoints.test.ts`: `listProperties` serializa los 5 filtros
  nuevos y omite los vacíos; `uploadPropertyPhoto` manda `FormData` sin
  `Content-Type` manual y con el campo `file`.
- **Valida:** contrato consumido por `T10`–`T16`; test propio en
  `endpoints.test.ts`. Prerrequisito de AC-1 a AC-12, AC-17 en el frontend.
- **Dependencias:** T8 (usa los tipos ya corregidos)
- **Paralelizable:** sí (con el resto del backend)

## T10 — `PropertyFilters.tsx`
- **Dificultad:** medium ← componente visual con debounce, sin lógica de negocio propia
- **Descripción:** Crear `frontend/src/components/properties/PropertyFilters.tsx`:
  controles para `status`, `operation`, `neighborhood`, `minPrice`,
  `maxPrice`, `rooms`, `q`; los selects (`status`, `operation`) disparan al
  cambiar, los inputs de texto/número (`q`, `minPrice`, `maxPrice`,
  `neighborhood`) se debouncean (~300ms). Copy explicativo: "sobre el valor
  numérico, sin conversión" junto a los campos de precio, y nota de que
  `rooms` exacto excluye propiedades sin ambientes cargados. Incluye
  `PropertyFilters.test.tsx`: cada filtro dispara `onChange` con la forma
  esperada; el debounce no dispara un request por tecla (usa fake timers).
- **Valida:** AC-2 (integración de UI) vía `PropertyFilters.test.tsx` —
  extremo a extremo en E2E 1 de `T18` (vía el contrato HTTP) y en
  `PropertiesPage.test.tsx` de `T16`.
- **Dependencias:** T9 (usa `ListPropertiesQuery` tipado)
- **Paralelizable:** sí

## T11 — `PropertiesList.tsx`
- **Dificultad:** medium ← componente visual de tabla, sin lógica de negocio propia
- **Descripción:** Crear `frontend/src/components/properties/PropertiesList.tsx`:
  tabla con `Table`/`THead`/`TBody`/`Tr`/`Th`/`Td` + `TableScroll`, columnas
  título, operación, precio (con moneda), barrio, estado, ambientes, acciones
  (editar, cambiar estado, borrar). Recibe `items: Property[]` y callbacks
  por fila; no hace fetch ni maneja estado propio. Incluye
  `PropertiesList.test.tsx`: renderiza filas con los datos correctos;
  dispara los callbacks al click de cada acción.
- **Valida:** AC-1 (listado) vía `PropertiesList.test.tsx` — integrado en
  `PropertiesPage.test.tsx` de `T16` y E2E 1 de `T18`.
- **Dependencias:** T9 (tipo `Property`)
- **Paralelizable:** sí

## T12 — `PhotoListEditor.tsx`
- **Dificultad:** medium ← componente visual con validación local, sin lógica de negocio propia
- **Descripción:** Crear `frontend/src/components/properties/PhotoListEditor.tsx`:
  lista editable de `photoUrls: string[]` con dos formas de agregar (elegir
  archivo → valida tamaño/extensión localmente **antes** de subir → llama
  `uploadPropertyPhoto` (T9) → agrega la URL devuelta; pegar URL → valida
  http(s) en cliente), botones quitar y subir/bajar (reordenamiento, sin
  drag-and-drop por decisión de la spec), sin distinguir origen una vez que
  la URL entra a la lista. El rechazo local de un archivo >5MB no dispara
  ningún request. Incluye `PhotoListEditor.test.tsx`: agregar por URL,
  agregar por archivo (mock de `uploadPropertyPhoto`), quitar, subir/bajar
  reflejado en el orden del array emitido hacia el padre; rechazo local de
  archivo >5MB sin request.
- **Valida:** AC-11 (UI de agregar/quitar/reordenar), AC-18 (validación
  local previa, la autoridad real es el backend de `T5`) vía
  `PhotoListEditor.test.tsx` — integrado en `PropertyForm.test.tsx` de `T13`
  y E2E 4/7 de `T18`/`T19`.
- **Dependencias:** T9 (usa `uploadPropertyPhoto`)
- **Paralelizable:** sí

## T13 — `PropertyForm.tsx`
- **Dificultad:** medium ← formulario de alta/edición con validación estándar, sin superficie crítica
- **Descripción:** Crear `frontend/src/components/properties/PropertyForm.tsx`,
  un solo componente para alta y edición: todos los campos del modelo
  `Property` (obligatorios: `title`, `operation`, `propertyType`, `price`,
  `neighborhood`) + `PhotoListEditor` (T12) embebido para `photoUrls`. En
  edición, envía solo los campos tocados (`PATCH` parcial, AC-7); en alta,
  usa `createProperty` (AC-4). Mapea 400 del backend a errores de campo
  (`price` no positivo, `photoUrls` malformada → AC-5) y 409 de
  `externalRef` duplicado a un error de campo específico (AC-6), sin
  reescribir el mensaje del backend. Incluye `PropertyForm.test.tsx`:
  campos obligatorios; envío solo de campos tocados en edición; 400 con
  motivo mostrado y sin crear/actualizar; 409 de `externalRef` mostrado como
  error de campo.
- **Valida:** AC-4, AC-5, AC-6, AC-7, AC-11, AC-12 vía `PropertyForm.test.tsx`
  — E2E 2, 3, 4 de `T18`.
- **Dependencias:** T9, T12
- **Paralelizable:** no (integra `PhotoListEditor`)

## T14 — `PropertyStatusControl.tsx`
- **Dificultad:** medium ← control dedicado de un solo campo, sin superficie crítica
- **Descripción:** Crear `frontend/src/components/properties/PropertyStatusControl.tsx`,
  separado del `PropertyForm`: opciones `ACTIVE`/`PAUSED`/`RESERVED`/
  `SOLD_OR_RENTED` (del `PropertyStatus` ya corregido en T8), llama a
  `updatePropertyStatus` (T9) con un solo campo (`PATCH :propertyId/status`),
  sin mezclarse con el resto del formulario. Copy que aclara que el cambio
  de estado deja de ofrecer la propiedad a leads nuevos, pero no retira
  fichas ya enviadas en conversaciones en curso. Incluye
  `PropertyStatusControl.test.tsx`: llama a `updatePropertyStatus` con
  valores del enum real, incluidos `RESERVED` y `SOLD_OR_RENTED`.
- **Valida:** AC-8 vía `PropertyStatusControl.test.tsx` — E2E 5 de `T18`
  (verificación end-to-end contra `PropertySearchService`, sin tocarlo).
- **Dependencias:** T8, T9
- **Paralelizable:** sí

## T15 — `DeletePropertyButton.tsx`
- **Dificultad:** medium ← modal de confirmación + manejo de 409, sin superficie crítica
- **Descripción:** Crear `frontend/src/components/properties/DeletePropertyButton.tsx`:
  botón secundario + `Modal` de confirmación; solo llama a `removeProperty`
  (T9) tras confirmar. Ante 409 (propiedad con `Appointment` asociado),
  muestra el mensaje del backend en un `ErrorBanner` **sin** quitar la fila
  de la lista (el padre no hace optimistic update). Incluye
  `DeletePropertyButton.test.tsx`: no llama a `removeProperty` hasta
  confirmar en el `Modal`; ante 409, muestra el mensaje y no dispara ningún
  callback de "eliminado".
- **Valida:** AC-9, AC-10 vía `DeletePropertyButton.test.tsx` — E2E 6 de
  `T18`.
- **Dependencias:** T9
- **Paralelizable:** sí

## T16 — `PropertiesPage.tsx`: orquestador
- **Dificultad:** medium ← wiring de componentes ya construidos en una página nueva, patrón calcado de `LeadsPage`/`PeoplePage`
- **Descripción:** Crear `frontend/src/routes/PropertiesPage.tsx`: estado
  local `{ filtros, page }` (reset de `page = 1` al cambiar cualquier
  filtro, ANTES de disparar la llamada — bug ya resuelto en `LeadsPage`, no
  repetirlo), `useApi` para el listado, modales de alta/edición
  (`PropertyForm`, T13), `PropertyStatusControl` (T14) y
  `DeletePropertyButton` (T15) por fila de `PropertiesList` (T11), filtros
  vía `PropertyFilters` (T10). Refetch tras cada mutación, cero optimistic
  update (patrón `PeoplePage`): es lo que hace que AC-10 funcione solo. Tres
  estados de `AsyncSection` mutuamente excluyentes: loading (skeleton de
  tabla), vacío (`emptyTestId="properties-empty"`, con **dos** CTAs: "Cargar
  propiedad" e "Importar CSV"), error (`ErrorBanner`). Reusa `CsvUploader`
  dentro de un `Modal` (recibe `tenantId` y `token`, nada más) y al cerrarse
  dispara el refetch de la lista, sin duplicar su reporte de errores.
  Incluye `PropertiesPage.test.tsx`: los filtros disparan el request
  correcto y resetean `page = 1`; los tres estados de `AsyncSection`; tras
  un 409 de borrado la fila **sigue** en la tabla con el `ErrorBanner`
  visible; el modal de CSV refetchea al cerrarse.
- **Valida:** AC-1, AC-3, AC-15 vía `PropertiesPage.test.tsx` — E2E 1, 11 de
  `T18`.
- **Dependencias:** T9, T10, T11, T13, T14, T15
- **Paralelizable:** no (integra todos los componentes de `components/properties/`)

## T17 — Link en `AppLayout` + ruta en `App.tsx`
- **Dificultad:** low ← dos líneas; lo único con contenido es el test de visibilidad para `AGENT`
- **Descripción:** En `frontend/src/routes/AppLayout.tsx`:
  `<Link to="/propiedades">Propiedades</Link>` **sin** condicional de rol,
  junto a Leads/Panel/Agenda (AC-14). En `frontend/src/App.tsx`: `<Route
  path="propiedades" element={<PropertiesPage />} />` (T16) dentro de
  `ProtectedRoute` + `AppLayout`. Extiende `AppLayout.test.tsx`: el link
  "Propiedades" se ve con `AGENT` y con `OWNER` — sin este test, un futuro
  copy-paste del bloque de `OWNER` lo esconde y nadie se entera.
- **Valida:** AC-14 vía `AppLayout.test.tsx` — E2E 10 de `T18`.
- **Dependencias:** T16
- **Paralelizable:** no (necesita el componente de destino de la ruta)

## T18 — E2E: CRUD, filtros, estado, borrado, permisos y CSV
- **Dificultad:** medium ← ejercita CRUD/DTOs de `properties` filtrado por `tenantId`, sin superficie crítica de filesystem
- **Descripción:** Crear `test/admin-properties-portal.e2e-spec.ts` (patrón
  de `test/admin-properties.e2e-spec.ts`: dos tenants + login de OWNER y de
  AGENT). Casos: (1) listado con cada filtro por separado y combinados,
  solo propiedades que cumplen todas las condiciones y ninguna del tenant B,
  incluida distinta capitalización de `q` y `neighborhood` con
  tilde/mayúsculas (AC-1, AC-2); (2) alta válida → 201 y aparece en el
  listado (AC-4); alta con `price` negativo, sin `title` y con una
  `photoUrl` malformada → 400 y nada creado (AC-5, AC-12); (3) `externalRef`
  duplicado → 409 y la propiedad existente intacta (AC-6); (4) `PATCH`
  parcial → solo cambia lo enviado (AC-7); `PATCH` con `photoUrls`
  reordenado → `position` refleja el nuevo orden (AC-11); (5) `PATCH
  :id/status` a `PAUSED`/`RESERVED`/`SOLD_OR_RENTED` + llamada a
  `PropertySearchService` → deja de aparecer en los resultados (AC-8); (6)
  `DELETE` sin citas → 200 y `PropertyPhoto` borrados por cascada (AC-9);
  `DELETE` con `Appointment` asociado → 409 y en DB siguen existiendo la
  propiedad y la cita (AC-10); (7) cross-tenant: OWNER de A sobre
  `propertyId` de B (`GET`/`PATCH`/`DELETE`/`PATCH status`) → 404/403 y
  datos de B intactos (AC-13); (8) los 6 verbos con sesión de AGENT →
  mismos códigos que con OWNER (AC-14); (9) import CSV por el endpoint
  existente → mismo `{ imported, errors[] }` de hoy, y los e2e existentes de
  propiedades pasan **sin modificación** (AC-15, AC-16).
- **Valida:** AC-1, AC-2, AC-3 (parcial, backend), AC-4, AC-5, AC-6, AC-7,
  AC-8, AC-9, AC-10, AC-11, AC-12, AC-13, AC-14, AC-15, AC-16 vía
  `test/admin-properties-portal.e2e-spec.ts`.
- **Dependencias:** T1, T2, T3
- **Paralelizable:** sí (con `T19` y con el frontend)

## T19 — E2E dedicado: upload de fotos y aislamiento multi-tenant (AC-19)
- **Dificultad:** high (y crítico) ← única superficie que ejercita punta a punta el aislamiento por filesystem entre tenants; mismo criterio que B1/B2: nivel más alto para la superficie crítica, con archivo propio dedicado a AC-19
- **Descripción:** Crear `test/admin-properties-photo-upload.e2e-spec.ts`
  (archivo separado del e2e de CRUD general, `UPLOADS_DIR` apuntando a un
  directorio temporal), con dos tenants + login de OWNER y de AGENT. Casos:
  (1) jpeg válido → 201 con URL bajo `PUBLIC_BASE_URL`, el archivo existe en
  `<UPLOADS_DIR>/properties/<tenantId>/` y un `GET` de esa URL devuelve 200
  con `Content-Type: image/jpeg` (AC-17); (2) PDF renombrado a `.jpg` → 400
  y directorio del tenant vacío (AC-18); (3) archivo de 6 MB → rechazo
  (400/413) y directorio vacío (AC-18); (4) **el caso central de AC-19**:
  dos tenants (A y B) suben la misma imagen (mismo contenido, mismo nombre
  de archivo del lado del cliente) → rutas resultantes en subdirectorios
  distintos, nombres de archivo distintos (uuid), ningún archivo pisado; se
  verifica explícitamente que a partir de la URL/ruta de A no se puede
  inferir ni construir la ruta de B; (5) intento de upload con un
  `tenantId` de la URL que no es el del tenant logueado (manipulación de
  ruta) → 403/404 antes de escribir nada en disco, mismo criterio que
  `TenantScopeGuard` aplica al resto del módulo (AC-13 aplicado al upload).
- **Valida:** AC-17, AC-18, AC-19 vía
  `test/admin-properties-photo-upload.e2e-spec.ts`.
- **Dependencias:** T4, T5, T6
- **Paralelizable:** sí (con `T18` y con el frontend)

## Orden de ejecución sugerido

> Lo usa `task-router` para despachar.

- **Grupo 1 (paralelo, sin deps):** T1, T4, T7, T8
- **Grupo 2 (paralelo, depende de Grupo 1):** T2 (dep T1, secuenciación por
  archivo), T5 (dep T4), T6 (dep T7), T9 (dep T8)
- **Grupo 3 (paralelo, depende de Grupo 2):** T3 (dep T2, secuenciación por
  archivo), T10 (dep T9), T11 (dep T9), T12 (dep T9), T14 (dep T8, T9), T15
  (dep T9), T19 (dep T4, T5, T6)
- **Grupo 4 (paralelo, depende de Grupo 3):** T13 (dep T9, T12), T18 (dep
  T1, T2, T3)
- **Grupo 5 (depende de Grupo 4):** T16 (dep T9, T10, T11, T13, T14, T15)
- **Grupo 6 (depende de Grupo 5):** T17 (dep T16)

## Cobertura de criterios

- AC-1 → T1, T10, T11, T16, T18 ✓
- AC-2 → T1, T10, T18 ✓
- AC-3 → T16, T18 ✓
- AC-4 → T9, T13, T18 ✓
- AC-5 → T9, T13, T18 ✓
- AC-6 → T9, T13, T18 ✓
- AC-7 → T3, T13, T18 ✓
- AC-8 → T8, T9, T14, T18 ✓
- AC-9 → T2, T15, T18 ✓
- AC-10 → T2, T15, T18 ✓
- AC-11 → T3, T12, T13, T18 ✓
- AC-12 → T3, T9, T13, T18 ✓
- AC-13 → T18, T19 ✓
- AC-14 → T17, T18 ✓
- AC-15 → T16, T18 ✓
- AC-16 → T18 ✓
- AC-17 → T5, T6, T9, T19 ✓
- AC-18 → T4, T5, T9, T12, T19 ✓
- AC-19 → T5, T19 ✓

Sin huecos: los 19 AC de `spec.md` (AC-1 a AC-19, numerados fuera de orden en
el archivo — el bloque salta de AC-12 a AC-17/18/19 y vuelve a AC-13/14/15/16,
pero los 19 existen y todos tienen al menos una tarea que los valida) tienen
cobertura. Los tres hallazgos del plan están incorporados: hallazgo 1 → T3,
hallazgo 2 → T8, hallazgo 3 (multer ya instalado) no requiere tarea. La
superficie crítica de upload (aislamiento multi-tenant por filesystem) tiene
su propia tarea de e2e dedicada (T19), separada del e2e de CRUD general
(T18), tal como se pidió.
