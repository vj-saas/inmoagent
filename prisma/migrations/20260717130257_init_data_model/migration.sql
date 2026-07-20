-- CreateEnum
CREATE TYPE "OperationType" AS ENUM ('SALE', 'RENT', 'TEMP_RENT');

-- CreateEnum
CREATE TYPE "PropertyStatus" AS ENUM ('ACTIVE', 'RESERVED', 'SOLD_OR_RENTED', 'PAUSED');

-- CreateEnum
CREATE TYPE "ConversationState" AS ENUM ('GREETING', 'QUALIFICATION', 'SEARCH_MATCH', 'SCHEDULING', 'HUMAN_HANDOFF', 'OPTED_OUT');

-- CreateEnum
CREATE TYPE "MessageDirection" AS ENUM ('IN', 'OUT');

-- CreateEnum
CREATE TYPE "MessageType" AS ENUM ('TEXT', 'AUDIO', 'IMAGE', 'DOCUMENT', 'TEMPLATE', 'UNSUPPORTED');

-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('PROPOSED', 'CONFIRMED', 'DONE', 'CANCELLED');

-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "phoneNumberId" TEXT NOT NULL,
    "wabaId" TEXT,
    "accessTokenEnc" TEXT NOT NULL,
    "displayPhone" TEXT,
    "botName" TEXT NOT NULL DEFAULT 'Asistente',
    "botTone" TEXT NOT NULL DEFAULT 'cordial y profesional, voseo argentino',
    "schedulingLink" TEXT,
    "humanHours" TEXT,
    "competitorsToAvoid" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "coverageAreas" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "privacyNoticeSent" BOOLEAN NOT NULL DEFAULT true,
    "apiKeyHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Property" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "externalRef" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "operation" "OperationType" NOT NULL,
    "propertyType" TEXT NOT NULL,
    "status" "PropertyStatus" NOT NULL DEFAULT 'ACTIVE',
    "price" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "expenses" DECIMAL(14,2),
    "neighborhood" TEXT NOT NULL,
    "city" TEXT,
    "address" TEXT,
    "rooms" INTEGER,
    "bedrooms" INTEGER,
    "bathrooms" INTEGER,
    "areaM2" INTEGER,
    "garage" BOOLEAN NOT NULL DEFAULT false,
    "petsAllowed" BOOLEAN,
    "features" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "listingUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Property_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PropertyPhoto" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PropertyPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "name" TEXT,
    "state" "ConversationState" NOT NULL DEFAULT 'GREETING',
    "fOperation" "OperationType",
    "fNeighborhoods" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "fMaxPrice" DECIMAL(14,2),
    "fCurrency" TEXT,
    "fMinRooms" INTEGER,
    "fNotes" TEXT,
    "handoffAt" TIMESTAMP(3),
    "optedOutAt" TIMESTAMP(3),
    "lastMessageAt" TIMESTAMP(3),
    "lastSearchIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "direction" "MessageDirection" NOT NULL,
    "type" "MessageType" NOT NULL,
    "waMessageId" TEXT,
    "body" TEXT,
    "mediaId" TEXT,
    "transcription" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Appointment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "propertyId" TEXT,
    "status" "AppointmentStatus" NOT NULL DEFAULT 'PROPOSED',
    "scheduledAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Appointment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookEvent" (
    "id" TEXT NOT NULL,
    "waMessageId" TEXT NOT NULL,
    "tenantId" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_phoneNumberId_key" ON "Tenant"("phoneNumberId");

-- CreateIndex
CREATE INDEX "Property_tenantId_status_operation_neighborhood_price_idx" ON "Property"("tenantId", "status", "operation", "neighborhood", "price");

-- CreateIndex
CREATE INDEX "Property_tenantId_status_operation_rooms_idx" ON "Property"("tenantId", "status", "operation", "rooms");

-- CreateIndex
CREATE UNIQUE INDEX "Property_tenantId_externalRef_key" ON "Property"("tenantId", "externalRef");

-- CreateIndex
CREATE INDEX "PropertyPhoto_propertyId_position_idx" ON "PropertyPhoto"("propertyId", "position");

-- CreateIndex
CREATE INDEX "Lead_tenantId_state_idx" ON "Lead"("tenantId", "state");

-- CreateIndex
CREATE INDEX "Lead_tenantId_lastMessageAt_idx" ON "Lead"("tenantId", "lastMessageAt");

-- CreateIndex
CREATE UNIQUE INDEX "Lead_tenantId_phone_key" ON "Lead"("tenantId", "phone");

-- CreateIndex
CREATE UNIQUE INDEX "Message_waMessageId_key" ON "Message"("waMessageId");

-- CreateIndex
CREATE INDEX "Message_tenantId_leadId_createdAt_idx" ON "Message"("tenantId", "leadId", "createdAt");

-- CreateIndex
CREATE INDEX "Appointment_tenantId_status_idx" ON "Appointment"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "WebhookEvent_waMessageId_key" ON "WebhookEvent"("waMessageId");

-- CreateIndex
CREATE INDEX "WebhookEvent_receivedAt_idx" ON "WebhookEvent"("receivedAt");

-- AddForeignKey
ALTER TABLE "Property" ADD CONSTRAINT "Property_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PropertyPhoto" ADD CONSTRAINT "PropertyPhoto_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
