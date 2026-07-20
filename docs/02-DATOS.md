# 02 — Modelo de Datos (Prisma)

Schema completo de referencia. Claude Code debe implementarlo en
`prisma/schema.prisma` tal cual, ajustando solo detalles sintácticos si la
versión de Prisma lo requiere.

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ─────────────────────────────────────────────
// TENANTS (inmobiliarias)
// ─────────────────────────────────────────────

model Tenant {
  id                String   @id @default(cuid())
  name              String
  slug              String   @unique
  active            Boolean  @default(true)

  // Meta WhatsApp Cloud API (credenciales de la inmobiliaria)
  phoneNumberId     String   @unique          // clave de ruteo del webhook
  wabaId            String?
  accessTokenEnc    String                    // token cifrado AES-256-GCM
  displayPhone      String?                   // +54 9 11 ... (informativo)

  // Configuración del bot
  botName           String   @default("Asistente")
  botTone           String   @default("cordial y profesional, voseo argentino")
  schedulingLink    String?                   // Calendly u otro
  humanHours        String?                  // ej: "Lun a Vie 9-18"
  competitorsToAvoid String[] @default([])
  coverageAreas     String[]  @default([])    // barrios/zonas que cubre
  privacyNoticeSent Boolean  @default(true)   // incluir aviso de datos en saludo

  // Admin
  apiKeyHash        String                    // argon2 de la API key del tenant

  properties        Property[]
  leads             Lead[]
  messages          Message[]
  appointments      Appointment[]

  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
}

// ─────────────────────────────────────────────
// PROPIEDADES
// ─────────────────────────────────────────────

enum OperationType {
  SALE      // venta
  RENT      // alquiler
  TEMP_RENT // alquiler temporario
}

enum PropertyStatus {
  ACTIVE
  RESERVED
  SOLD_OR_RENTED
  PAUSED
}

model Property {
  id            String         @id @default(cuid())
  tenantId      String
  tenant        Tenant         @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  externalRef   String?                      // ID en CRM externo (Tokko, etc.)
  title         String
  description   String?
  operation     OperationType
  propertyType  String                       // "departamento" | "casa" | "ph" | "local" | "lote"
  status        PropertyStatus @default(ACTIVE)

  price         Decimal        @db.Decimal(14, 2)
  currency      String         @default("USD") // USD | ARS
  expenses      Decimal?       @db.Decimal(14, 2) // expensas en ARS

  neighborhood  String                       // normalizado en minúsculas sin tildes
  city          String?
  address       String?                      // NO se envía al lead hasta agendar

  rooms         Int?                         // ambientes
  bedrooms      Int?
  bathrooms     Int?
  areaM2        Int?
  garage        Boolean       @default(false)
  petsAllowed   Boolean?
  features      String[]      @default([])   // "balcón", "patio", "amenities", ...

  listingUrl    String?                      // ficha pública (Zonaprop, web propia)
  photos        PropertyPhoto[]

  // Post-MVP: re-ranking semántico (mantener nullable, no usar en MVP)
  // embedding  Unsupported("vector(1536)")?

  createdAt     DateTime      @default(now())
  updatedAt     DateTime      @updatedAt

  @@unique([tenantId, externalRef])
  @@index([tenantId, status, operation, neighborhood, price])
  @@index([tenantId, status, operation, rooms])
}

model PropertyPhoto {
  id         String   @id @default(cuid())
  propertyId String
  property   Property @relation(fields: [propertyId], references: [id], onDelete: Cascade)
  url        String                          // URL pública (https) accesible por Meta
  position   Int      @default(0)

  @@index([propertyId, position])
}

// ─────────────────────────────────────────────
// LEADS Y CONVERSACIÓN
// ─────────────────────────────────────────────

enum ConversationState {
  GREETING
  QUALIFICATION
  SEARCH_MATCH
  SCHEDULING
  HUMAN_HANDOFF
  OPTED_OUT
}

model Lead {
  id             String            @id @default(cuid())
  tenantId       String
  tenant         Tenant            @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  phone          String                      // E.164 sin '+' (formato wa_id de Meta)
  name           String?
  state          ConversationState @default(GREETING)

  // Filtros capturados por calificación
  fOperation     OperationType?
  fNeighborhoods String[]          @default([])
  fMaxPrice      Decimal?          @db.Decimal(14, 2)
  fCurrency      String?
  fMinRooms      Int?
  fNotes         String?                     // extras en lenguaje natural ("con patio")

  // Control
  handoffAt      DateTime?                   // cuándo pasó a humano (para timeout 48h)
  optedOutAt     DateTime?
  lastMessageAt  DateTime?
  lastSearchIds  String[]          @default([]) // IDs del último resultado (validación de salida)

  messages       Message[]
  appointments   Appointment[]

  createdAt      DateTime          @default(now())
  updatedAt      DateTime          @updatedAt

  @@unique([tenantId, phone])
  @@index([tenantId, state])
  @@index([tenantId, lastMessageAt])
}

enum MessageDirection {
  IN
  OUT
}

enum MessageType {
  TEXT
  AUDIO
  IMAGE
  DOCUMENT
  TEMPLATE
  UNSUPPORTED
}

model Message {
  id            String           @id @default(cuid())
  tenantId      String
  tenant        Tenant           @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  leadId        String
  lead          Lead             @relation(fields: [leadId], references: [id], onDelete: Cascade)

  direction     MessageDirection
  type          MessageType
  waMessageId   String?          @unique     // ID de Meta (dedupe y status updates)
  body          String?                      // texto o caption
  mediaId       String?                      // media_id de Meta
  transcription String?                      // resultado de STT para audios
  meta          Json?                        // payload crudo recortado / status

  createdAt     DateTime         @default(now())

  @@index([tenantId, leadId, createdAt])
}

// ─────────────────────────────────────────────
// AGENDAMIENTO
// ─────────────────────────────────────────────

enum AppointmentStatus {
  PROPOSED    // bot ofreció agenda
  CONFIRMED   // lead confirmó fecha (manual o vía Calendly webhook post-MVP)
  DONE
  CANCELLED
}

model Appointment {
  id          String            @id @default(cuid())
  tenantId    String
  tenant      Tenant            @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  leadId      String
  lead        Lead              @relation(fields: [leadId], references: [id], onDelete: Cascade)
  propertyId  String?
  status      AppointmentStatus @default(PROPOSED)
  scheduledAt DateTime?
  notes       String?

  createdAt   DateTime          @default(now())
  updatedAt   DateTime          @updatedAt

  @@index([tenantId, status])
}

// ─────────────────────────────────────────────
// IDEMPOTENCIA DE WEBHOOKS
// ─────────────────────────────────────────────

model WebhookEvent {
  id          String   @id @default(cuid())
  waMessageId String   @unique
  tenantId    String?
  receivedAt  DateTime @default(now())

  @@index([receivedAt]) // para purga periódica (> 30 días)
}
```

## Notas de implementación

1. **Normalización de barrios.** Guardar `neighborhood` en minúsculas y sin
   tildes (`caballito`, `villa urquiza`). La extracción del LLM debe normalizar
   igual. Mantener en `properties/neighborhoods.ts` un diccionario de alias
   (`"capital" → CABA`, `"palermo soho" → "palermo"`).
2. **Búsqueda SQL (MVP).** Query base:
   `status = ACTIVE AND operation = :op AND (neighborhood IN :barrios OR :sinBarrio)
   AND (price <= :maxPrice * 1.10 OR :sinPrecio) AND (rooms >= :minRooms OR :sinAmb)`
   con tolerancia de +10% en precio, orden por precio ascendente, `LIMIT 3`.
   Si 0 resultados: relajar en orden barrio → ambientes → precio y avisar al lead
   qué criterio se flexibilizó.
3. **`lastSearchIds`** se sobreescribe en cada búsqueda y es la lista blanca para
   la validación de salida del LLM.
4. **Seed** (`prisma/seed.ts`): 1 tenant demo + 12 propiedades en CABA (Palermo,
   Caballito, Belgrano, Villa Urquiza; mezcla venta/alquiler, USD/ARS, 1-4
   ambientes, con 2 fotos placeholder cada una vía `https://picsum.photos`) +
   API key demo impresa por consola.
5. **Purga**: job diario que borra `WebhookEvent` > 30 días.
6. **Migración futura a pgvector**: cuando se active, `CREATE EXTENSION vector`,
   descomentar columna `embedding` y poblar con un job batch. Nada del MVP
   depende de esto.
