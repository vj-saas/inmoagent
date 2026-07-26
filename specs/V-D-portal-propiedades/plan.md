# Plan V-D: Portal de gestión de propiedades

> Producido por planner. Define CÓMO se construye lo que la spec V-D pide.
> Las decisiones de modelado ya están resueltas y aprobadas en la spec (filtros
> nuevos en el listado, permisos OWNER+AGENT sin `OwnerRoleGuard`, upload con
> `multer` sobre volumen de Railway, borrado bloqueado por `Appointment`, CSV
> intacto, ruta `/propiedades` reusando el design system). Este plan NO las
> re-discute: define su implementación.
>
> Superficie mixta: el **upload de fotos** introduce una segunda superficie de
> aislamiento multi-tenant (el filesystem, además de la DB) y una ruta pública
> nueva sin guards → **high**, y toca lo que `CLAUDE.md` clasifica como
> **crítico** (aislamiento multi-tenant) ⇒ requiere aprobación humana. El resto
> (filtros, validación de `remove`, fotos en `update`, pantalla) es **medium**:
> CRUD con lógica de negocio estándar, sin schema nuevo, sin tocar FSM ni LLM.

## Hallazgos previos (correcciones y huecos respecto de la spec)

Tres cosas que la spec da por resueltas y **no lo están** en el código actual.
Los tres son bloqueantes de algún AC, así que entran al alcance de este plan.

1. **`PropertiesAdminService.update` ignora las fotos.** `UpdatePropertyDto`
   extiende `PartialType(CreatePropertyDto)`, así que `photoUrls` **pasa la
   validación** y llega al service… que nunca lo usa (el `data` del
   `prisma.property.update` no menciona `photos`; el comentario del DTO lo
   admite: *"no incluye fotos, ver README"*). Hoy editar una propiedad y mandar
   `photoUrls` devuelve **200 sin haber cambiado nada**: falla silenciosa, la
   peor forma de fallar. **AC-11 ("agrega, quita o reordena fotos en el
   formulario de alta o edición y guarda → persistir la lista con el orden")
   es inalcanzable sin tocar `update`.** Se agrega (ver Decisión "Fotos en
   `update`").
2. **Los tipos del stub del frontend están mal.**
   `frontend/src/api/endpoints.ts` declara
   `PropertyStatus = 'ACTIVE' | 'PAUSED' | 'SOLD' | 'RENTED'` y
   `OperationType = 'SALE' | 'RENT'`. El enum real de Prisma es
   `ACTIVE | RESERVED | SOLD_OR_RENTED | PAUSED` y `SALE | RENT | TEMP_RENT`.
   Con los tipos actuales, el control de cambio de estado mandaría valores que
   el `@IsEnum` del backend rechaza con 400 y **`RESERVED` sería inalcanzable
   desde la UI** (AC-8 nombra los tres estados explícitamente). Se corrigen los
   tipos: es un fix, no un "tipado de stubs".
3. **`multer` ya es dependencia directa** (`multer@^2.2.0` + `@types/multer` en
   `package.json`) y `FileInterceptor` ya se usa en
   `POST :tenantId/properties/import`. El upload no suma ninguna dependencia
   nueva. **`@nestjs/serve-static` NO está instalado** — ver la decisión sobre
   servido de estáticos.

## Arquitectura

Cuatro frentes, acoplados solo por contratos HTTP y por el modelo `Property`.
Cero cambios de schema Prisma, cero migraciones.

- **Backend CRUD (medium).** Todo sucede dentro de `src/admin/properties/`,
  sobre el controller y el service que ya existen. No se crea módulo, ni
  controller, ni guard. Tres cambios: filtros en el `where` del `list`, fotos en
  el `update`, y la validación de `Appointment` en el `remove`.

- **Backend upload + servido estático (high / crítico).** Un endpoint nuevo en
  el mismo controller (`POST :tenantId/properties/photos`) que valida en memoria
  y recién después escribe en disco, más un `PropertyPhotoStorageService` nuevo
  que es el **único** lugar del proyecto que arma una ruta de filesystem a
  partir de un `tenantId`. El servido es middleware estático en `main.ts`, fuera
  de la cadena de guards.

- **Infra (low, pero bloqueante en deploy).** Una env var nueva (`UPLOADS_DIR`),
  un volumen persistente de Railway montado en `/data/uploads`, y la
  documentación del paso en `docs/06-DEPLOY.md`.

- **Frontend (medium).** Ruta `/propiedades` nueva, link en `AppLayout` sin
  condicional de rol, componentes bajo `frontend/src/components/properties/`, y
  los stubs de `endpoints.ts` tipados de verdad.

Flujo completo del alta con foto por archivo:

```
navegador                         backend                        volumen / DB
---------                         -------                        ------------
1. PhotoListEditor
   POST /admin/tenants/:t/properties/photos   (multipart, Bearer)
      guards: TenantThrottlerGuard -> PersonOrApiKeyGuard
      FileInterceptor(memoryStorage, limits.fileSize = 5MB)
        -> sniff de magic bytes (jpeg/png/webp)   [nada tocó el disco todavía]
        -> assertSafeTenantId(tenantId)
        -> writeFile(UPLOADS_DIR/properties/<tenantId>/<uuid>.<ext>)  ---> volumen
      <- 201 { url: PUBLIC_BASE_URL + "/uploads/properties/<t>/<uuid>.<ext>" }

2. la URL entra como una fila más de la lista editable de fotos (idéntica a
   una URL externa pegada a mano: el resto del flujo no distingue el origen)

3. POST /admin/tenants/:t/properties  { ..., photoUrls: [url1, url2, ...] }
      -> Property + PropertyPhoto(position = índice del array)          ---> DB

4. el bot, al enviar la ficha, usa PropertyPhoto.url tal cual (sin cambios)
   Meta hace GET https://<PUBLIC_BASE_URL>/uploads/...  (público, sin auth)
      -> express.static sirve el archivo desde el volumen
```

## Entidades / módulos afectados

### Backend — `src/admin/properties/`

- `list-properties-query.dto.ts` (**modifica**): `+ neighborhood?: string`,
  `+ minPrice?: number`, `+ maxPrice?: number`, `+ rooms?: number`,
  `+ q?: string`. Todos `@IsOptional()`, con `@Type(() => Number)` en los
  numéricos (llegan como string en la query string).
- `properties-admin.service.ts` (**modifica**):
  - `list()`: arma el `where` con los cinco filtros nuevos (AND implícito).
  - `update()`: sincroniza `photos` cuando `dto.photoUrls !== undefined`
    (hallazgo 1), dentro de una `$transaction`.
  - `remove()`: `$transaction` con 404 → chequeo de `Appointment` → 409 →
    `delete` (AC-9, AC-10).
  - `+ private findOneOrThrow(client, tenantId, propertyId)`: la query de
    `getOne` extraída para poder correr con el cliente de transacción.
- `property-photo-storage.service.ts` (**nuevo**): `save(tenantId, file)` →
  `{ url, relativePath }`. Resuelve directorio, valida el `tenantId` como
  segmento de path, genera el nombre y construye la URL pública. Único dueño del
  filesystem.
- `image-magic-bytes.util.ts` (**nuevo**): `sniffImageType(buffer): 'jpeg' |
  'png' | 'webp' | null`, función pura, ~30 líneas, sin dependencias.
- `admin-properties.controller.ts` (**modifica**): `+ POST 'photos'` con
  `FileInterceptor('file', { limits: { fileSize: MAX_PHOTO_BYTES } })`. Los
  otros 7 handlers no cambian ni una línea.
- `src/admin/admin.module.ts` (**modifica**): registra
  `PropertyPhotoStorageService` en `providers`.

### Backend — infra

- `src/config/env.schema.ts` (**modifica**):
  `+ UPLOADS_DIR: z.string().min(1).default('./uploads')`.
- `src/main.ts` (**modifica**): `NestFactory.create<NestExpressApplication>(...)`
  + `app.useStaticAssets(uploadsDir, { prefix: '/uploads/', index: false,
  dotfiles: 'ignore', maxAge: '30d', immutable: true })` + `mkdir -p` y chequeo
  de arranque del punto de montaje (ver decisión).
- `railway.toml` (**modifica**): volumen persistente montado en `/data/uploads`.
- `.env.example` (**modifica**): `UPLOADS_DIR`.
- Dev: `UPLOADS_DIR=./uploads` (relativo al cwd) y `uploads/` en `.gitignore`.
- `docs/06-DEPLOY.md` (**modifica**): paso de creación del volumen + la
  restricción de una sola réplica.
- `docs/02-DATOS.md` (**modifica**, menor): nota de que `PropertyPhoto.url`
  puede apuntar al propio backend.

### Frontend

- `frontend/src/api/endpoints.ts` (**modifica**): corrige `PropertyStatus` y
  `OperationType` (hallazgo 2); `+ interface Property`,
  `+ interface PropertyPhoto`, `+ interface ListPropertiesResponse`; tipa las 6
  funciones existentes; extiende `ListPropertiesQuery` con los 5 filtros;
  `+ uploadPropertyPhoto(tenantId, file, token)` (usa `FormData`, ya soportado
  por `http-client` desde V-C).
- `frontend/src/routes/PropertiesPage.tsx` (**nuevo**): orquestador (filtros,
  página, modales, refetch). Patrón calcado de `LeadsPage` (estado local
  `{filtros, page}`, `useApi`, reset de `page` al cambiar un filtro) y de
  `PeoplePage` (modales, refetch tras mutación, cero optimistic update).
- `frontend/src/components/properties/PropertyFilters.tsx` (**nuevo**).
- `frontend/src/components/properties/PropertiesList.tsx` (**nuevo**): tabla con
  `Table/THead/TBody/Tr/Th/Td` + `TableScroll`.
- `frontend/src/components/properties/PropertyForm.tsx` (**nuevo**): alta y
  edición (mismo componente, dos usos).
- `frontend/src/components/properties/PhotoListEditor.tsx` (**nuevo**): lista
  editable (agregar por archivo, agregar por URL, quitar, subir/bajar).
- `frontend/src/components/properties/PropertyStatusControl.tsx` (**nuevo**):
  control dedicado de estado, separado del formulario (AC-8).
- `frontend/src/components/properties/DeletePropertyButton.tsx` (**nuevo**):
  `Modal` de confirmación + manejo del 409.
- `frontend/src/routes/AppLayout.tsx` (**modifica**):
  `<Link to="/propiedades">Propiedades</Link>` **sin** condicional de rol
  (AC-14), junto a Leads/Panel/Agenda.
- `frontend/src/App.tsx` (**modifica**):
  `<Route path="propiedades" element={<PropertiesPage />} />` dentro de
  `ProtectedRoute` + `AppLayout`.
- Tests `*.test.tsx` junto a cada componente/ruta nueva (patrón vigente).

### Sin cambios (explícito)

- `src/admin/properties/csv-import.service.ts` y `csv-parser.util.ts` — se
  reusan tal cual (AC-15). `upsertByExternalRef` tampoco se toca.
- `src/properties/property-search.service.ts`, `src/conversation/*`,
  `src/llm/*`, `src/pipeline/*` — AC-16 es regresión, no feature.
- `prisma/schema.prisma` — **ninguna migración**. En particular NO se agrega la
  FK `Appointment.propertyId → Property` (ver riesgos).
- `PersonOrApiKeyGuard`, `TenantScopeGuard`, `TenantApiKeyGuard`,
  `OwnerRoleGuard` — sin cambios y sin guard nuevo (Decisión 2 de la spec).
- `frontend/src/components/onboarding/CsvUploader.tsx` — se **reusa** en
  `/propiedades` tal cual (recibe `tenantId` + `token`, nada más).

## Decisiones técnicas

### Filtros del listado (`list`)

- **Se construye el `where` con spreads condicionales, igual que hoy.** El
  método ya usa `...(filters.status ? {...} : {})`; los cinco filtros nuevos
  siguen ese patrón, sin abstraer un query-builder. Alternativa descartada:
  reusar el armado de `SearchFilters` de `property-search.service.ts` — la
  semántica es deliberadamente distinta (el motor del lead **relaja** `rooms` y
  usa `neighborhoods` en plural; el admin filtra exacto), y acoplarlos metería
  una superficie **crítica** (el motor de búsqueda del LLM) dentro del radio de
  daño de un CRUD **medium**. Se mantienen separados a propósito.
- **`neighborhood` se normaliza con `normalizeNeighborhood` antes de comparar, y
  se compara por igualdad exacta.** La columna guarda el valor normalizado
  (minúsculas sin tildes) porque tanto `create` como `upsertByExternalRef` lo
  normalizan al escribir. Sin normalizar el filtro, buscar "Palermo" no
  encuentra nada y el bug es invisible (lista vacía, no error). Alternativa
  descartada: `contains` insensitive — haría que "flores" matchee "villa flores"
  y "flores norte", ruido inaceptable en un filtro que el operador usa para
  contar stock.
- **`q` es `title: { contains: q, mode: "insensitive" }`, solo sobre `title`.**
  Es literalmente lo que pide la Decisión 1 de la spec. No se suman `address` ni
  `description` al OR: `address` es el campo que la regla de negocio protege (no
  se envía al lead hasta agendar) y buscarlo no está pedido; sumar campos
  degrada la query sin AC que lo justifique. Se hace `trim()` y, si queda vacío,
  el filtro no se aplica (evita `contains` de cadena vacía, que matchea todo
  pero fuerza el scan).
- **`minPrice`/`maxPrice` → `price: { gte, lte }` combinados en un solo
  objeto.** `price` es `Decimal(14,2)`; Prisma acepta `number` en las
  comparaciones. **Limitación explícita: el filtro NO convierte monedas.** Un
  tenant con stock en USD y ARS mezclado que filtra `maxPrice: 200000` verá las
  de ARS excluidas y las de USD incluidas. No se usa `USD_ARS_RATE`: existe solo
  para *ordenar* resultados del lead, nunca para filtrar (ver el comentario en
  `env.schema.ts`), y usarlo acá sería hacer exactamente lo que ese comentario
  prohíbe. Se resuelve en la UI: la columna de precio muestra la moneda y el
  filtro rotula "sobre el valor numérico, sin conversión". Un filtro `currency`
  no está en la spec y queda como follow-up.
- **`rooms` es coincidencia exacta (`rooms: filters.rooms`), sin relajar.**
  Decisión 1 de la spec. Efecto colateral a documentar en la UI: las propiedades
  con `rooms = null` (columna nullable) desaparecen del listado cuando el filtro
  está activo. Es correcto —el operador pidió "3 ambientes"— pero hay que
  decirlo, porque el total cambia y parece un dato perdido.
- **`@Type(() => Number)` en `minPrice`/`maxPrice`/`rooms`.** Sin eso llegan como
  string y `@IsNumber()`/`@IsInt()` los rechazan con 400 (el `ValidationPipe`
  global tiene `transform: true`, pero el transform de primitivos en query
  necesita el decorador explícito, como ya hace `page`). Es el error más fácil de
  cometer acá y rompe AC-2 entero.
- **`@Min(0)` en precios y en `rooms`, `@MaxLength(120)` en `q` y
  `neighborhood`.** Límites baratos que evitan queries absurdas. NO se valida
  `minPrice <= maxPrice`: un rango invertido devuelve lista vacía, que es
  autoexplicativo y no amerita un validador cruzado.
- **No se agregan índices.** Los dos índices compuestos existentes
  (`[tenantId, status, operation, neighborhood, price]` y
  `[tenantId, status, operation, rooms]`) cubren los prefijos de las
  combinaciones más usadas, y el `contains` de `q` es un scan por diseño. El
  orden de magnitud es cientos/pocos miles de propiedades por tenant: un índice
  trigram (`pg_trgm`) sería sobre-ingeniería y exigiría una migración (**high**)
  para un CRUD interno. Se revisa si algún tenant supera las ~50k propiedades.
- **`PAGE_SIZE = 20` y el `orderBy` por `createdAt desc` no se tocan** (spec).

### `remove`: validación de `Appointment` atómica y consistente con el service

Forma exacta:

```
remove(tenantId, propertyId):
  await this.prisma.$transaction(async (tx) => {
    await this.findOneOrThrow(tx, tenantId, propertyId)            // 404 (AC-13)
    const linked = await tx.appointment.findFirst({
      where: { tenantId, propertyId },
      select: { id: true },
    })
    if (linked) throw new ConflictException(MSG_TIENE_VISITAS)      // 409 (AC-10)
    await tx.property.delete({ where: { id: propertyId } })         // AC-9
  })

MSG_TIENE_VISITAS = "No se puede eliminar: la propiedad tiene visitas
agendadas. Cambiá su estado a Pausada para sacarla de circulación."
```

- **Las tres operaciones van dentro de una `$transaction` interactiva, no
  sueltas.** Es el punto que el resto del service resuelve peor (`update` y
  `updateStatus` hacen `getOne` y después `update`, con una ventana TOCTOU) y no
  hay razón para propagar esa deuda al único endpoint **destructivo**. Con la
  transacción, "existe, no tiene citas, borrala" es una unidad: si algo lanza, no
  se borró nada. Alternativa descartada: replicar el patrón `getOne` + `count` +
  `delete` sin transacción — funciona el 99,9% de las veces y falla justo en el
  caso irreversible.
- **`findFirst({ select: { id: true } })` y no `count()`.** Solo se necesita un
  booleano: `findFirst` corta en la primera fila que matchea; `count` recorre
  todas. No hay índice con `propertyId` como columna líder (`Appointment` tiene
  `[tenantId, status]` y `[tenantId, scheduledAt]`), así que la query recorre las
  citas del tenant filtrando por `propertyId`: con cientos de citas es
  irrelevante, y agregar un índice implicaría una migración (**high**) para una
  query que corre en un borrado manual. Follow-up si `Appointment` crece a
  decenas de miles por tenant.
- **`where: { tenantId, propertyId }`, con `tenantId` explícito** aunque
  `propertyId` ya sea único: convención innegociable de `CLAUDE.md` y, además,
  necesario acá — sin `tenantId`, una cita de otro tenant que (por el bug
  histórico de datos huérfanos) apunte al mismo `propertyId` bloquearía un
  borrado legítimo.
- **`findOneOrThrow(client, ...)` extraído y compartido con `getOne`.** Evita
  que la query de 404 se duplique y quede desincronizada entre el camino
  transaccional y el normal. `getOne` pasa a ser
  `findOneOrThrow(this.prisma, ...)`: su comportamiento externo no cambia (mismo
  404, mismo mensaje, mismo `include`), así que los tests existentes siguen
  verdes.
- **El mensaje del 409 sugiere la acción alternativa, en español.** Es el copy
  que exige AC-10 y el que sostiene la Decisión 4 de la spec ("cambiar estado es
  la vía primaria"). El frontend lo muestra tal cual en un `ErrorBanner`, sin
  reescribirlo: una sola fuente para el texto.
- **NO se agrega la FK de `Appointment.propertyId` a `Property`.** Sería la
  defensa real (a nivel DB, inmune a cualquier otro camino de borrado), pero
  implica migración (**high**) y, sobre todo, un backfill: si ya existen filas
  huérfanas en producción —que es exactamente lo que la spec detectó como
  posible—, el `ALTER TABLE ADD CONSTRAINT` **falla al aplicarse** y tumba el
  deploy (`prisma migrate deploy` corre en el `CMD` del Dockerfile antes de
  `node dist/main.js`: una migración que falla deja el servicio entero abajo,
  webhook incluido). Queda como follow-up con su propia spec: limpieza de
  huérfanos + `onDelete: Restrict`.

### Fotos en `update` (hallazgo 1)

- **`update` sincroniza fotos solo si `photoUrls` está presente en el body.**
  `undefined` → no se toca nada (AC-7: "actualizar únicamente los campos
  enviados"); array presente → **reemplazo completo** (`deleteMany` + `create`
  con `position` = índice), dentro de la misma `$transaction` que el `update` del
  resto de los campos.
- **`photoUrls: []` borra todas las fotos.** Divergencia deliberada con
  `upsertByExternalRef`, que usa `replacePhotos = photoUrls && length > 0` (o
  sea: array vacío = no tocar). Ahí la semántica es correcta porque el CSV puede
  no traer la columna de fotos y no debe destruir las cargadas a mano; acá el
  formulario **siempre** manda la lista completa y "la dejé vacía" solo puede
  significar "quiero sacarlas todas" (AC-11 pide poder quitar).
  `upsertByExternalRef` no se toca (fuera de alcance por spec).
- **Reemplazo completo y no diff.** El diff ahorraría dos statements y agregaría
  una función de reconciliación con casos borde (misma URL en dos posiciones,
  reordenamiento puro) sobre listas de 5-15 elementos. El reemplazo dentro de una
  transacción es trivialmente correcto: o queda la lista nueva entera, o no
  cambia nada. Costo asumido: los `PropertyPhoto.id` cambian en cada guardado;
  nadie los referencia (el bot usa `url`, la cascada es por `propertyId`).
- **`position` = índice del array recibido, sin campo `position` en el
  request.** El orden es el del array: un solo dato, imposible de contradecirse.
  Alternativa descartada: una lista de objetos con `position` explícito —
  permitiría posiciones duplicadas o con huecos y obligaría a validarlas.
- **La validación de URL sigue siendo la del DTO
  (`@IsUrl({}, { each: true })`), sin cambios** — AC-12 ya está cubierto, y la
  transacción garantiza que un 400 no persista ninguna foto.

### Upload de fotos: validación (AC-18)

- **`memoryStorage` (default de `FileInterceptor` cuando no se pasa `storage`) +
  escritura manual después de validar.** Es lo que hace que AC-18 diga la
  verdad: con `diskStorage` el archivo ya está en el volumen cuando el
  `fileFilter` lo rechaza y hay que borrarlo a mano (y si el proceso muere en el
  medio, queda). Con memoria, **nada toca el disco hasta que pasó las dos
  validaciones**. El techo de 5 MB acota el costo en RAM.
- **El tipo se valida por magic bytes, no por `file.mimetype` ni por la
  extensión.** `file.mimetype` viene del `Content-Type` que declara el
  **cliente** en la parte multipart: es input del atacante, igual que el nombre.
  `image-magic-bytes.util.ts` compara los primeros bytes del buffer:
  `FF D8 FF` (jpeg), `89 50 4E 47 0D 0A 1A 0A` (png), `RIFF` + `WEBP` en los
  offsets 0 y 8 (webp). Devuelve `null` → 400. **La extensión del archivo
  guardado se deriva del tipo detectado**, nunca de la que mandó el usuario: así
  el `Content-Type` que después sirve el estático (que lo infiere de la
  extensión) siempre coincide con el contenido real, y no hay forma de guardar un
  `.html` o un `.svg` con cabecera de imagen. Alternativa descartada: la librería
  `file-type` — 3 formatos conocidos no justifican una dependencia (`CLAUDE.md`:
  no sumar dependencias sin justificación) y una función pura de 30 líneas se
  testea mejor.
- **WebP se sniffea con los 12 bytes completos, no solo `RIFF`.** `RIFF` a secas
  también es WAV y AVI.
- **SVG queda fuera a propósito**, aunque sea "una imagen": es XML ejecutable
  (scripts, XXE) servido desde nuestro propio dominio. La spec ya lo excluye; se
  documenta el porqué para que nadie lo agregue "por completitud".
- **Doble techo de tamaño:** `limits: { fileSize: MAX_PHOTO_BYTES }` en el
  interceptor (aborta el stream, protege la RAM) **y** un chequeo explícito de
  `file.size` en el service. El primero es la defensa real; el segundo cubre que
  alguien copie el handler sin el `limits`.
  **Desvío respecto de AC-18, para aprobación:** cuando multer aborta por tamaño,
  Nest traduce el `MulterError` `LIMIT_FILE_SIZE` a `PayloadTooLargeException` →
  **413**, no 400. Es el código HTTP correcto y obtenerlo gratis es preferible a
  interceptarlo para degradarlo a 400. Se propone leer AC-18 como "rechaza sin
  guardar nada" y que el frontend trate 400 y 413 con el mismo mensaje, además de
  pre-chequear el tamaño antes de subir.

### Upload de fotos: aislamiento multi-tenant (AC-19) — la parte crítica

- **Un único service (`PropertyPhotoStorageService`) construye rutas.** Ningún
  controller ni componente arma paths. Un solo lugar para auditar, un solo lugar
  para testear, radio de daño acotado.
- **`tenantId` se valida como segmento de path antes de cualquier `join`:**
  `assertSafeTenantId(tenantId)` exige la forma de un cuid
  (`/^[a-z0-9]{20,40}$/i`) y lanza si no matchea. Los guards ya garantizan que
  ese valor salió de la DB (`TenantScopeGuard` lo compara con
  `person.tenantId`; `TenantApiKeyGuard` lo resuelve por la key), así que esto es
  defensa en profundidad pura: hoy es redundante, y el día que alguien agregue un
  camino donde el `tenantId` venga de otro lado, un `../..` no se convierte en
  escritura arbitraria en el filesystem. Mismo criterio que ya aplica el proyecto
  al usar `req.person.tenantId` aunque `TenantScopeGuard` ya haya validado el
  param.
- **Nombre del archivo: `crypto.randomUUID()` + extensión derivada del sniff.**
  `randomUUID` es del core de Node (nada que instalar) y es CSPRNG: la URL no se
  puede adivinar ni enumerar. El nombre original del usuario **no se usa para
  nada** —ni siquiera se guarda—: es la vía clásica de path traversal, de
  colisión entre tenants y de XSS por nombre reflejado.
- **Ruta: `<UPLOADS_DIR>/properties/<tenantId>/<uuid>.<ext>`.** El nivel
  `properties/` deja lugar para otros tipos de upload sin mezclarlos y sin migrar
  archivos. El `mkdir` es `{ recursive: true }` (idempotente, sin chequeo previo).
- **La URL pública se arma con `PUBLIC_BASE_URL` (env ya existente y ya usada por
  el webhook), no con el header `Host` del request.** Confiar en `Host`
  permitiría a un atacante hacer que persistamos en DB una URL apuntando a su
  dominio, que después el bot le mandaría al lead como si fuera nuestra. Se
  normaliza la barra final para no generar `//uploads`.
- **Se asume y documenta que las fotos son públicas sin autenticación.** No es un
  descuido: **Meta tiene que poder hacer GET de esa URL** y no hay forma de
  autenticar a Meta. La confidencialidad se apoya en que la URL es impredecible
  (capability URL). Consecuencia asumida: quien conozca la URL la ve para
  siempre; borrar la propiedad no la invalida (ver riesgos). Es el mismo modelo
  que ya tiene hoy el sistema con las fotos alojadas en portales externos.
- **El `tenantId` visible en la URL no es un secreto** (es un cuid, ya viaja en
  todas las URLs del panel). Lo que la spec pide —y lo que se cumple— es que un
  tenant no pueda *pisar* ni *inferir* archivos de otro: lo garantiza el uuid, no
  el directorio. El directorio por tenant sirve para operar (borrar/auditar todo
  lo de un tenant) y para acotar el daño de un bug de nombres.

### Servido del volumen: `useStaticAssets` vs `ServeStaticModule` vs middleware propio

**Decisión: `app.useStaticAssets()` en `main.ts` (viene con
`@nestjs/platform-express`, ya instalado), con prefijo `/uploads/`.**

```ts
const app = await NestFactory.create<NestExpressApplication>(AppModule, {
  bufferLogs: true, rawBody: true,
});
// ...
app.useStaticAssets(resolve(config.get('UPLOADS_DIR', { infer: true })), {
  prefix: '/uploads/',
  index: false,          // sin listado ni index.html
  dotfiles: 'ignore',    // nada de ocultos si alguien los copia ahí
  redirect: false,
  maxAge: '30d',
  immutable: true,       // el nombre es un uuid: el contenido nunca cambia
});
```

Comparación:

| | `ServeStaticModule` | `useStaticAssets` (elegido) | middleware propio |
|---|---|---|---|
| Dependencia nueva | **sí** (`@nestjs/serve-static`) | no (ya viene con `platform-express`) | no |
| Código a mantener | ninguno | 6 líneas de config | ~60 líneas: MIME, rangos, ETag, 404, traversal |
| Traversal / normalización | resuelto (usa `serve-static`) | resuelto (**es** `serve-static`) | a cargo nuestro |
| ETag / Range / 304 | sí | sí | a implementar |
| Riesgo | un `serveRoot` mal puesto sirve toda la app | acotado al prefijo | alto: código de seguridad propio |

- **Por qué no `ServeStaticModule`:** haría exactamente lo mismo (por dentro usa
  `serve-static`, igual que `express.static`) a cambio de una dependencia nueva.
  `CLAUDE.md` pide justificar cada dependencia agregada y acá no hay nada que
  justificar: su valor real es servir un SPA con fallback a `index.html`
  (`renderPath`), que es justo lo que **no** queremos. Además su `rootPath` se
  resuelve en tiempo de import del módulo, más incómodo de alimentar desde
  `ConfigService` que una línea en `main.ts`, donde el `ConfigService` ya está
  disponible y ya se leen `PORT` y `CORS_ORIGINS`.
- **Por qué no un middleware propio:** servir estáticos "a mano" es código de
  seguridad (normalización de path, symlinks, MIME, rangos). Escribirlo para
  ahorrar una llamada de una línea a la implementación que ya usan Express y Nest
  es mala apuesta. Solo tendría sentido si hiciera falta autorizar por tenant
  cada archivo, y **no hace falta: Meta debe poder leerlos sin credenciales**.
- **El estático corre como middleware: no pasa por `PersonOrApiKeyGuard`, ni por
  el `ThrottlerGuard` global, ni por el `ValidationPipe`.** Es intencional y hay
  que decirlo en voz alta, porque es una superficie pública nueva en un backend
  que hasta hoy solo exponía `/health` y `/webhook/whatsapp` sin auth. Lo que la
  protege: prefijo acotado a un directorio dedicado, `index: false` (sin
  listado), `dotfiles: 'ignore'`, nombres uuid, y que ahí adentro solo hay
  archivos que el propio backend escribió tras validarlos.
- **Compatibilidad con `helmet`, ya verificada:** `crossOriginResourcePolicy:
  'cross-origin'` ya está configurado en `main.ts` (para que el panel, que vive
  en otro origen, consuma la API), así que los `<img>` del panel cargan sin tocar
  nada. La CSP restrictiva se emite *en la respuesta de la imagen*, donde es
  inocua (la CSP que gobierna el render es la de la página que la embebe).
  `X-Content-Type-Options: nosniff` también se emite: por eso importa que la
  extensión —y por lo tanto el `Content-Type`— se derive del sniff y no del
  usuario.
- **`immutable` + `maxAge: 30d` son seguros** justamente porque el nombre es un
  uuid: una URL nunca cambia de contenido. Ahorra ancho de banda con Meta y con
  el panel.

### Volumen de Railway (`railway.toml`) y `UPLOADS_DIR`

- **Mount path `/data/uploads`, `UPLOADS_DIR` como env var con default
  `./uploads`.** El código nunca hardcodea `/data/uploads`: en dev y en los e2e
  el directorio es local y descartable; en Railway apunta al volumen. Que sea env
  var (y no constante) es lo que permite que los tests de upload corran en un
  `tmpdir` sin ensuciar el repo.
- **En `railway.toml`** se declara el volumen junto al build y el deploy, para
  que el deploy siga siendo reproducible desde el repo:

  ```toml
  [[deploy.volumes]]
  mountPath = "/data/uploads"
  name = "uploads"
  ```

  **Verificación obligatoria del implementer:** el soporte de volúmenes en el
  config-as-code de Railway es más nuevo que el resto del archivo y la clave
  exacta cambió entre versiones del schema. Si `railway.toml` con ese bloque no
  valida, **el volumen se crea igual desde el dashboard o con
  `railway volume add`** (mount path `/data/uploads`), `railway.toml` queda como
  está y el paso manual se documenta en `docs/06-DEPLOY.md`. Lo que **no** es
  negociable es el mount path y que el paso quede escrito: un redeploy sin
  volumen borra las fotos.
- **Tamaño inicial: 5 GB.** A 5 MB por archivo (el peor caso; una foto de celular
  ronda 2-3 MB) son ~1.000-2.500 fotos, y una propiedad lleva 5-10: cubre
  cientos de propiedades por tenant. Se agranda en caliente desde Railway;
  empezar chico evita pagar espacio ocioso. Umbral de revisión: 80% de uso.
- **Detección de "volumen no montado" al arrancar.** Si el volumen falta, el
  proceso escribe igual en el filesystem efímero del contenedor y **las fotos
  desaparecen en el siguiente deploy, sin ningún error**: el peor modo de falla
  posible (pérdida silenciosa). En `main.ts`, con `NODE_ENV === 'production'`, se
  compara `statSync(UPLOADS_DIR).dev` contra `statSync('/').dev`: si son iguales,
  el directorio no es un punto de montaje separado → se loguea `error` con un
  mensaje explícito ("UPLOADS_DIR no parece estar en un volumen persistente: las
  fotos subidas se van a perder en el próximo deploy"). **Se loguea, no se aborta
  el boot:** tirar abajo el servicio entero —webhook incluido, con la regla de
  <1s y los mensajes de leads en juego— por un problema de la funcionalidad de
  fotos es una cura peor que la enfermedad. El `mkdir -p` del directorio también
  se hace en el arranque, para fallar temprano si el volumen está montado
  read-only.
- **`uploads/` va al `.gitignore`**, y en la imagen Docker no debe viajar
  contenido de ese directorio.

### Permisos y ubicación del endpoint de upload

- **`POST :tenantId/properties/photos` va en `AdminPropertiesController`,
  heredando los guards de clase (`TenantThrottlerGuard`, `PersonOrApiKeyGuard`) y
  el `@Throttle` de 120/min por tenant.** Sin guard nuevo, sin `OwnerRoleGuard`
  (Decisión 2 de la spec). Ubicarlo en el mismo controller es lo que garantiza,
  por construcción, que el aislamiento sea idéntico al del resto del recurso: un
  controller nuevo obligaría a re-declarar la cadena de guards y sería el lugar
  donde el día de mañana se olvidan de una.
- **No hay colisión de rutas:** el controller define `@Post()` y
  `@Post('import')`, no hay `@Post(':propertyId')`. `@Get(':propertyId')` sí
  existe, pero no se agrega ningún `GET photos` (los archivos se leen por
  `/uploads/...`).
- **El upload NO recibe `propertyId`.** Devuelve una URL suelta que el formulario
  usa después en el `POST`/`PATCH` de la propiedad. Así funciona igual en el alta
  (donde la propiedad todavía no existe) que en la edición, y no hay que inventar
  un estado "foto huérfana pendiente de asociar". Costo: si el usuario sube una
  foto y abandona el formulario, el archivo queda sin referenciar (ver riesgos).
- **El throttle de 120/min alcanza y no se ajusta.** Cargar una propiedad son
  5-15 fotos; el techo real de abuso lo pone el tamaño (5 MB), no la frecuencia.

### Frontend

- **`PropertiesPage` es orquestador; toda la pintura vive en
  `components/properties/`.** Mismo criterio que `components/onboarding/` en V-C
  y `components/leads/` en V-B2. El estado (filtros, `page`, modal abierto,
  errores de acción) vive en la página; los componentes reciben props.
- **Estado de filtros calcado de `LeadsPage`: al cambiar cualquier filtro se
  resetea `page = 1` ANTES de disparar la llamada.** Sin eso, filtrar estando en
  la página 3 devuelve una página vacía que parece "no hay resultados" (bug ya
  resuelto en `LeadsPage`: no repetirlo).
- **El input de texto (`q`) y los de precio se debouncean (~300 ms) o se aplican
  con submit explícito; los selects, al cambiar.** Un request por tecla sobre una
  query con `contains` es la forma más fácil de hacer lenta esta pantalla.
- **Refetch tras cada mutación, cero optimistic update.** Patrón explícito de
  `PeoplePage`: la única fuente de verdad de la lista es un GET exitoso. Es lo
  que hace que AC-10 (409 al borrar) funcione solo: si no se quitó nada de la
  lista localmente, no hay nada que revertir; se muestra el `ErrorBanner` y la
  fila sigue ahí.
- **Estados de la lista vía `AsyncSection`** (loading con skeleton de tabla,
  `isEmpty` con `emptyTestId="properties-empty"`, error con `ErrorBanner`),
  mutuamente excluyentes. El estado vacío lleva **dos** CTAs: "Cargar propiedad"
  e "Importar CSV" (AC-3).
- **`PropertyStatusControl` separado del `PropertyForm`.** Lo pide la spec y
  además evita el peor error de UX posible acá: que "marcar vendida" viaje junto
  a un `PATCH` de 18 campos y que un error de validación en `price` impida sacar
  de circulación una propiedad ya vendida. El cambio de estado es un solo
  `PATCH :propertyId/status` con un solo campo (AC-8).
- **`PhotoListEditor` no distingue origen.** Dos entradas (elegir archivo →
  `uploadPropertyPhoto` → URL; pegar URL → validación de http(s) en el cliente) y
  una sola lista de strings hacia arriba. El reordenamiento es con botones
  subir/bajar (la spec descarta drag-and-drop). Valida tamaño y extensión
  **antes** de subir para dar feedback inmediato, sabiendo que la autoridad es el
  backend (el sniff de magic bytes no se replica en el navegador: no tendría
  sentido).
- **El link "Propiedades" en `AppLayout` va sin condicional de rol**, junto a
  Leads/Panel/Agenda/Llamar hoy, y `PropertiesPage` **no** hace ningún chequeo de
  `person.role` (AC-14). Se agrega un caso en `AppLayout.test.tsx` que verifica
  que un `AGENT` lo ve: sin ese test, un futuro copy-paste del bloque de `OWNER`
  lo esconde y nadie se entera.
- **`CsvUploader` se reusa tal cual dentro de un `Modal`** (recibe `tenantId` y
  `token`, nada más) y al cerrarse dispara el refetch de la lista (AC-15). No se
  duplica ni una línea de su reporte de errores.
- **Los tipos corregidos (`PropertyStatus`, `OperationType`) se exportan y
  alimentan los `<Select>`**, para que las opciones del formulario salgan del
  tipo y no de strings sueltos.

## Riesgos y edge cases

- **[Archivos huérfanos en el volumen]** Ni borrar una propiedad, ni quitar una
  foto de la lista, ni abandonar un formulario a medio llenar borran el archivo
  del disco. El volumen solo crece. Es la limitación conocida más concreta de
  esta spec. Mitigación: 5 GB dan mucho aire y el crecimiento es lento;
  follow-up natural = un job en `MaintenanceProcessor` que borre archivos bajo
  `properties/<tenantId>/` sin ninguna fila `PropertyPhoto` que los referencie
  (con margen de gracia de 24 hs para no borrar los que están en un formulario
  abierto). **No se implementa acá**: es borrado destructivo con su propio riesgo
  y merece su spec.
- **[Fotos que sobreviven al borrado de la propiedad]** El `onDelete: Cascade`
  borra las filas `PropertyPhoto`, no los archivos: la URL sigue sirviendo la
  imagen. Para una foto de un inmueble es aceptable; **si alguna vez se sube algo
  con datos personales, esto es un problema de Ley 25.326** (derecho de
  supresión). Se documenta y se ata al follow-up de limpieza.
- **[Instancia única]** El volumen es disco local: con más de una réplica del
  backend, la instancia B no ve los archivos que escribió la A y las fotos fallan
  de forma intermitente. La spec lo asume (Decisión 3). Consecuencia operativa a
  escribir en `docs/06-DEPLOY.md`: **mientras se use volumen, el servicio debe
  quedar en una sola réplica.** Migrar a object storage es el follow-up.
- **[`PUBLIC_BASE_URL` mal configurada]** Si apunta a un host que Meta no puede
  resolver, las fotos se guardan bien pero **el bot no puede enviarlas**: el
  fallo aparece lejos del upload, en el envío de la ficha al lead. Mitigación: el
  frontend renderiza un preview con la URL devuelta, así el operador ve al
  instante si carga o no.
- **[Volumen no montado]** Cubierto por la detección de arranque (log `error`).
  Riesgo residual: nadie mira los logs. Se menciona en la checklist de deploy.
- **[Volumen lleno]** `writeFile` falla con `ENOSPC` → 500 genérico. Se mapea a
  un error con mensaje en español y se loguea `error` con `tenantId`: un 500
  crudo acá se diagnostica mal (parece un bug de la app, no un disco lleno).
- **[Race del 409 de borrado]** Entre el chequeo de `Appointment` y el `delete`,
  otra transacción podría insertar una cita (Postgres en Read Committed no lo
  bloquea sin FK ni lock). La ventana es de milisegundos y el peor resultado es
  exactamente el estado de hoy (un `Appointment` con `propertyId` huérfano). La
  solución definitiva es la FK con `Restrict`, deliberadamente diferida. Se
  documenta; no se mitiga con locks aplicativos.
- **[Huérfanos preexistentes]** Si en producción ya hay `Appointment` apuntando a
  propiedades borradas, esta spec **no los limpia** (ningún AC lo pide) y la
  validación nueva tampoco los detecta (mira citas de propiedades que existen).
  Se recomienda una query de diagnóstico al desplegar.
- **[Filtro de precio y monedas mezcladas]** Ver decisión de filtros. Puede dar
  la sensación de que faltan propiedades. Mitigado con copy en la UI.
- **[Filtro `rooms` y `rooms = null`]** Las propiedades sin ambientes cargados
  desaparecen al filtrar. Correcto, pero hay que decirlo en la UI.
- **[`q` sin índice]** `contains` insensitive es un scan del tenant. Aceptable a
  la escala actual; si un tenant llega a decenas de miles de propiedades se
  evalúa `pg_trgm` (migración, **high**).
- **[Cambiar estado a `PAUSED` no corta una conversación en curso]** El bot
  re-consulta la DB en cada `search_properties`, así que deja de ofrecerla a
  partir de ese momento — pero **si ya le mandó la ficha al lead hace 30
  segundos, esa ficha sigue en el chat**. La UI no debe prometer "se retiró de
  todas las conversaciones". AC-8 se cumple (deja de aparecer en los resultados);
  el copy tiene que ser preciso.
- **[Upload sin límite de fotos por propiedad]** Nada impide subir 200 fotos a
  una propiedad. El formulario limita la lista visualmente; un tope duro en el
  DTO no está pedido por la spec pero es una línea: se propone
  `@ArrayMaxSize(30)` en `photoUrls` (queda para aprobación).
- **[`ValidationPipe` global con `whitelist: true`]** Ya elimina cualquier
  propiedad no declarada en los DTOs: los filtros nuevos no abren superficie para
  inyectar claves arbitrarias en el `where` — que además se arma campo por campo,
  nunca con spread del query crudo.
- **[Aislamiento]** Todas las queries nuevas llevan `tenantId` (`list`,
  `findFirst` de `Appointment`, `findOneOrThrow`, sincronización de fotos vía el
  `propertyId` ya validado) y la ruta del filesystem se deriva del `tenantId`
  validado por los guards + `assertSafeTenantId`. Ninguna query nueva cruza
  tenants.

## Clasificación por pieza (para `task-splitter` / `task-router`)

| Pieza | Nivel | Por qué |
|---|---|---|
| Filtros en `ListPropertiesQueryDto` + `list` | **medium** | CRUD y DTO de `properties` filtrado por `tenantId`, sin superficie crítica |
| Validación de `Appointment` en `remove` (+ `$transaction`) | **medium** | Lógica de negocio acotada sobre un service existente, sin schema nuevo |
| Fotos en `update` (hallazgo 1) | **medium** | Escritura CRUD transaccional, no toca el motor de búsqueda |
| `image-magic-bytes.util.ts` | **medium** | Función pura sin I/O; rol de seguridad pero aislada y 100% testeable en unit |
| `PropertyPhotoStorageService` + `POST photos` | **high** (y **crítico**) | Resuelve el `tenantId` sobre una **segunda superficie de aislamiento** (filesystem): un bug de path pisa o filtra archivos entre tenants. `CLAUDE.md`: "cualquier query o lógica que resuelva el tenant o que pueda filtrar datos entre tenants" |
| `useStaticAssets` en `main.ts` + chequeo de montaje | **high** | Ruta pública nueva sin guards, sin throttle y sin validación, en un backend que hoy solo expone `/health` y el webhook |
| `railway.toml` + `UPLOADS_DIR` + `.env.example` + `docs/06-DEPLOY.md` | **low** | Configuración y documentación (el chequeo de arranque, que cubre el riesgo de pérdida de datos, va con la pieza **high** de `main.ts`) |
| Fix de tipos `PropertyStatus`/`OperationType` en `endpoints.ts` | **low** | Corrección de tipos, sin lógica |
| Tipado de los stubs + `uploadPropertyPhoto` | **medium** | Cliente HTTP con `FormData`, sin lógica de negocio propia |
| `PropertiesPage` + componentes de `components/properties/` | **medium** | Feature de UI con estado y validación de formulario, sin superficie crítica |
| Link en `AppLayout` + ruta en `App.tsx` | **low** | Dos líneas; lo único con contenido es el test de visibilidad para `AGENT` |

## Plan de tests

### Unit (backend)

- `image-magic-bytes.util.spec.ts` (**nuevo**) — AC-18: buffers mínimos válidos
  de jpeg/png/webp → tipo correcto; PDF, SVG, HTML, ZIP, buffer vacío, buffer de
  3 bytes y un `RIFF` que **no** es WEBP (WAV) → `null`; y el caso adversario
  clave: **archivo con cabecera PNG y nombre `.php`/`.html` → se detecta `png` y
  se guarda con extensión `.png`** (la extensión del usuario nunca se usa).
- `property-photo-storage.service.spec.ts` (**nuevo**, `UPLOADS_DIR` en un
  `tmpdir`) — AC-19: dos tenants suben archivos → directorios distintos, nombres
  distintos, ninguno adivinable a partir del otro; el nombre original
  (`../../etc/passwd.jpg`) no aparece en la ruta resultante; `assertSafeTenantId`
  lanza con `../otro`, `a/b` y cadena vacía **sin escribir nada**; la URL
  devuelta arranca con `PUBLIC_BASE_URL` y no duplica barras.
- `properties-admin.service.spec.ts` (**extiende**) — `list` arma el `where`
  esperado para cada filtro y para la combinación de todos (AC-2), con
  `neighborhood` normalizado; `remove` con `Appointment` existente → `Conflict` y
  `property.delete` **no** invocado (AC-10); sin citas → borra (AC-9); con una
  cita de **otro** tenant sobre el mismo `propertyId` → borra igual; `update` con
  `photoUrls` presente reemplaza y respeta `position`, con array vacío borra
  todas, sin `photoUrls` no toca fotos (AC-7, AC-11).

### E2E (`test/admin-properties-portal.e2e-spec.ts`, nuevo)

Patrón de `test/admin-properties.e2e-spec.ts` (dos tenants + login de OWNER y de
AGENT), con `UPLOADS_DIR` apuntando a un directorio temporal.

1. Listado con cada filtro por separado y con todos combinados: solo devuelve las
   que cumplen **todas** las condiciones y ninguna del tenant B (AC-1, AC-2).
   Incluye `q` con distinta capitalización y `neighborhood` con tilde y
   mayúsculas.
2. Alta válida → 201 y aparece en el listado (AC-4); alta con `price` negativo,
   sin `title` y con una `photoUrl` malformada → 400 y **nada** creado (AC-5,
   AC-12).
3. `externalRef` duplicado → 409 y la propiedad existente intacta (AC-6).
4. `PATCH` parcial → solo cambia lo enviado (AC-7); `PATCH` con `photoUrls`
   reordenado → `position` refleja el nuevo orden (AC-11).
5. `PATCH :id/status` a `PAUSED`/`RESERVED`/`SOLD_OR_RENTED` + llamada a
   `PropertySearchService` → la propiedad ya no aparece en los resultados (AC-8,
   verificación end-to-end del guardrail, sin tocar el motor).
6. `DELETE` sin citas → 200 y sus `PropertyPhoto` borrados por cascada (AC-9);
   `DELETE` con un `Appointment` asociado → 409 y en DB **siguen existiendo** la
   propiedad y la cita (AC-10).
7. Upload: jpeg válido → 201 con URL bajo `PUBLIC_BASE_URL`, el archivo existe en
   `<UPLOADS_DIR>/properties/<tenantId>/` y un `GET` de esa URL devuelve 200 con
   `Content-Type: image/jpeg` (AC-17); PDF renombrado a `.jpg` → 400 y
   **directorio vacío**; archivo de 6 MB → rechazo (413/400) y directorio vacío
   (AC-18).
8. Dos tenants suben la misma imagen → rutas distintas, ningún archivo pisado
   (AC-19).
9. Cross-tenant: OWNER de A hace `GET`/`PATCH`/`DELETE`/`PATCH status` sobre un
   `propertyId` de B → 404/403 y datos de B intactos (AC-13).
10. Los 6 verbos con sesión de **AGENT** → mismos códigos que con OWNER (AC-14).
11. Import CSV por el endpoint existente → mismo `{ imported, errors[] }` de hoy;
    los e2e existentes de propiedades pasan **sin modificación** (AC-15, AC-16).

### Frontend (vitest + RTL)

- `PropertiesPage.test.tsx` — los filtros disparan el request con la query
  correcta y resetean `page = 1`; los tres estados de `AsyncSection` (skeleton,
  vacío con las dos CTAs, error); tras un 409 de borrado la fila **sigue** en la
  tabla y se ve el `ErrorBanner` con el mensaje del backend.
- `PropertyForm.test.tsx` — campos obligatorios, envío solo de campos tocados en
  edición, 409 de `externalRef` mostrado como error de campo.
- `PhotoListEditor.test.tsx` — agregar por URL, agregar por archivo (mock de
  `uploadPropertyPhoto`), quitar, subir/bajar reflejado en el orden del array
  enviado; rechazo local de archivo >5 MB sin request.
- `PropertyStatusControl.test.tsx` — llama a `updatePropertyStatus` con valores
  del enum real (incluye `RESERVED` y `SOLD_OR_RENTED`).
- `DeletePropertyButton.test.tsx` — no llama a `removeProperty` hasta confirmar
  en el `Modal`.
- `AppLayout.test.tsx` (**extiende**) — el link "Propiedades" se ve con `AGENT` y
  con `OWNER` (AC-14).
- `endpoints.test.ts` (**extiende**) — `listProperties` serializa los 5 filtros
  nuevos y omite los vacíos; `uploadPropertyPhoto` manda `FormData` sin
  `Content-Type` manual.

## Trazabilidad

- **AC-1** → `PropertiesPage` + ruta dentro de `ProtectedRoute`;
  `list(tenantId, ...)` con `where.tenantId` y `PAGE_SIZE = 20` sin cambios;
  `tenantId` sale de `person.tenantId` del `AuthContext`. E2E 1.
- **AC-2** → los 5 filtros nuevos en `ListPropertiesQueryDto` + `where` armado
  con spreads condicionales (AND implícito de Prisma). Unit del `where` + E2E 1.
- **AC-3** → `AsyncSection` con `isEmpty` y `emptyTestId="properties-empty"`, con
  CTAs "Cargar propiedad" e "Importar CSV", excluyente de loading y error. Test
  de `PropertiesPage`.
- **AC-4** → `createProperty` tipada + `POST` existente sin cambios + refetch de
  la lista (sin recarga de página). E2E 2.
- **AC-5** → `CreatePropertyDto` + `ValidationPipe` global → 400 antes del
  handler; el frontend muestra el motivo y no agrega la fila. E2E 2.
- **AC-6** → `mapUniqueConstraint` (P2002 → 409) ya existente; el formulario mapea
  `ConflictError` a error de campo. E2E 3.
- **AC-7** → `update` arma el `data` campo por campo (los `undefined` no se
  escriben) y las fotos solo se tocan si `photoUrls` viene. E2E 4.
- **AC-8** → `PropertyStatusControl` → `PATCH :id/status` (un solo campo) y
  `property-search.service.ts` intacto (solo devuelve `ACTIVE`). E2E 5.
- **AC-9** → `remove`: sin `Appointment` → `property.delete` dentro de la
  `$transaction`; `PropertyPhoto` cae por el `onDelete: Cascade` existente. E2E 6.
- **AC-10** → `findFirst` de `Appointment` por `{ tenantId, propertyId }` dentro
  de la transacción → `ConflictException` con copy que sugiere cambiar el estado;
  el frontend no quita la fila. Unit + E2E 6.
- **AC-11** → `PhotoListEditor` (agregar/quitar/reordenar) → `photoUrls` ordenado
  → `create`/`update` persisten `position` = índice; el bot sigue leyendo
  `PropertyPhoto.url` sin cambios. Unit + E2E 4.
- **AC-12** → `@IsUrl({}, { each: true })` en `photoUrls` → 400, y la
  sincronización de fotos ocurre dentro de la transacción (nada persiste).
- **AC-13** → `TenantScopeGuard`/`TenantApiKeyGuard` + `findOneOrThrow` con
  `{ id, tenantId }` → 403/404 sin exponer datos. E2E 9.
- **AC-14** → sin `OwnerRoleGuard` en el controller (ya es así) + link en
  `AppLayout` sin condicional + `PropertiesPage` sin chequeo de rol. E2E 10 +
  test de `AppLayout`.
- **AC-15** → `CsvUploader` y `POST :tenantId/properties/import` reusados sin
  cambios. E2E 11.
- **AC-16** → no se toca `property-search.service.ts`, ni `conversation/`, ni
  `llm/`, ni `pipeline/`; los e2e existentes pasan sin modificación.
- **AC-17** → `POST :tenantId/properties/photos` →
  `PropertyPhotoStorageService.save` escribe en
  `<UPLOADS_DIR>/properties/<tenantId>/<uuid>.<ext>` y devuelve
  `PUBLIC_BASE_URL` + `/uploads/...`, servida por `useStaticAssets`. E2E 7.
- **AC-18** → `memoryStorage` + `sniffImageType` (magic bytes) +
  `limits.fileSize`: el rechazo ocurre **antes** de cualquier escritura. Unit del
  util + E2E 7 (verifica directorio vacío). *Desvío: el rechazo por tamaño llega
  como 413.*
- **AC-19** → `assertSafeTenantId` + subdirectorio por `tenantId` +
  `crypto.randomUUID()` como nombre + nombre original descartado. Unit del
  storage + E2E 8.

## Aprobaciones pendientes

> El upload de fotos toca aislamiento multi-tenant (superficie **crítica** según
> `CLAUDE.md`), así que estas decisiones necesitan visto bueno humano antes de
> pasar a `task-splitter`.

1. **Servido del volumen con `app.useStaticAssets()` en `main.ts`** (de
   `@nestjs/platform-express`, sin dependencia nueva), prefijo `/uploads/`,
   `index: false`, `dotfiles: 'ignore'`, cache inmutable. Implica una **ruta
   pública nueva sin guards ni throttling**, necesaria porque Meta debe poder
   descargar las fotos sin credenciales. Se descartan `ServeStaticModule`
   (dependencia nueva por cero valor) y un middleware propio (reimplementar
   código de seguridad).
2. **Modelo de confidencialidad "capability URL":** las fotos son públicas para
   cualquiera que conozca la URL; la protección es el uuid impredecible, no la
   autorización. Consecuencia asumida: borrar la propiedad no invalida la URL.
3. **`UPLOADS_DIR` como env var (default `./uploads`) + volumen de Railway
   montado en `/data/uploads`, 5 GB**, declarado en `railway.toml` si el schema
   de config-as-code vigente lo soporta y, si no, creado desde el dashboard/CLI y
   documentado en `docs/06-DEPLOY.md`. Incluye la restricción operativa de
   **mantener una sola réplica** mientras se use volumen.
4. **Chequeo de arranque del punto de montaje** (`statSync().dev` del directorio
   vs. el de `/`, en producción) que **loguea `error` pero NO aborta el boot**: no
   se tumba el webhook por un problema de la funcionalidad de fotos.
5. **Validación de tipo por magic bytes con un util propio de ~30 líneas**
   (jpeg/png/webp), sin la dependencia `file-type`, y **extensión del archivo
   guardado derivada del tipo detectado**, nunca del nombre del usuario.
6. **Desvío de AC-18:** el rechazo por tamaño responde **413**
   (`PayloadTooLargeException`, que Nest genera solo a partir del `MulterError`),
   no 400. Se propone aceptarlo y que el frontend trate ambos igual.
7. **`remove` envuelto en `$transaction`** (404 → chequeo de `Appointment` → 409 →
   `delete`) con `findFirst` en vez de `count`, y **`findOneOrThrow` extraído** y
   compartido con `getOne`.
8. **NO se agrega la FK `Appointment.propertyId → Property` con `Restrict`.**
   Sería la defensa definitiva, pero implica una migración (**high**) que puede
   **fallar en el `migrate deploy` del arranque si ya hay filas huérfanas** y
   dejar el servicio entero abajo. Queda como follow-up con spec propia (limpieza
   de huérfanos + constraint).
9. **`update` pasa a sincronizar fotos** (hallazgo 1; sin esto AC-11 es
   inalcanzable), con `photoUrls: []` = borrar todas, divergiendo a propósito de
   `upsertByExternalRef` (CSV), que no se toca.
10. **Corrección de `PropertyStatus`/`OperationType` en el frontend**
    (`SOLD`/`RENTED` → `RESERVED`/`SOLD_OR_RENTED`, `+ TEMP_RENT`): es un fix, no
    un tipado, y sin él AC-8 no se puede cumplir.
11. **`@ArrayMaxSize(30)` en `photoUrls`** (tope duro de fotos por propiedad), no
    pedido por la spec pero de una línea.
12. **La limpieza de archivos huérfanos del volumen queda FUERA de alcance** y se
    propone como spec follow-up (job en `MaintenanceProcessor`), junto con la
    migración a object storage.
