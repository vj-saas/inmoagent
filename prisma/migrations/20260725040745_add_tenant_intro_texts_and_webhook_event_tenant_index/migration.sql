-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "handoffIntro" TEXT,
ADD COLUMN     "welcomeIntro" TEXT;

-- CreateIndex
CREATE INDEX "WebhookEvent_tenantId_receivedAt_idx" ON "WebhookEvent"("tenantId", "receivedAt");
