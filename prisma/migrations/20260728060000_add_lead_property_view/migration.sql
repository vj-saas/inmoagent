-- CreateTable
CREATE TABLE "LeadPropertyView" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "titleSnapshot" TEXT NOT NULL,
    "neighborhoodSnapshot" TEXT NOT NULL,
    "priceSnapshot" DECIMAL(14,2) NOT NULL,
    "currencySnapshot" TEXT NOT NULL,
    "firstShownAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastShownAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "timesShown" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "LeadPropertyView_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LeadPropertyView_leadId_propertyId_key" ON "LeadPropertyView"("leadId", "propertyId");

-- CreateIndex
CREATE INDEX "LeadPropertyView_tenantId_leadId_lastShownAt_idx" ON "LeadPropertyView"("tenantId", "leadId", "lastShownAt");

-- AddForeignKey
ALTER TABLE "LeadPropertyView" ADD CONSTRAINT "LeadPropertyView_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadPropertyView" ADD CONSTRAINT "LeadPropertyView_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
