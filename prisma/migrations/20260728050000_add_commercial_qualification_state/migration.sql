-- AlterEnum
ALTER TYPE "ConversationState" ADD VALUE 'COMMERCIAL_QUALIFICATION';

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "pendingPropertyId" TEXT;
