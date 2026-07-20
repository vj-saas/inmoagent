-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "fPriceMentionedAtTurn" INTEGER,
ADD COLUMN     "turnCount" INTEGER NOT NULL DEFAULT 0;
