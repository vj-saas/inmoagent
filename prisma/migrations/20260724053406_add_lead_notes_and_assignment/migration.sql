-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "assignedUserId" TEXT,
ADD COLUMN     "contactedAt" TIMESTAMP(3),
ADD COLUMN     "nextActionAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "LeadNote" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "authorPersonId" TEXT,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LeadNote_tenantId_leadId_createdAt_idx" ON "LeadNote"("tenantId", "leadId", "createdAt");

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadNote" ADD CONSTRAINT "LeadNote_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadNote" ADD CONSTRAINT "LeadNote_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadNote" ADD CONSTRAINT "LeadNote_authorPersonId_fkey" FOREIGN KEY ("authorPersonId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;
