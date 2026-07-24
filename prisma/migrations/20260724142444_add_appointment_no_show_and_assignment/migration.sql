-- AlterEnum
ALTER TYPE "AppointmentStatus" ADD VALUE 'NO_SHOW';

-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "assignedUserId" TEXT,
ADD COLUMN     "outcome" TEXT;

-- CreateIndex
CREATE INDEX "Appointment_tenantId_scheduledAt_idx" ON "Appointment"("tenantId", "scheduledAt");

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;
