-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "alertPhone" TEXT,
ADD COLUMN     "alertsEnabled" BOOLEAN NOT NULL DEFAULT false;
