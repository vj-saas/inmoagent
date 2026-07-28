-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "qTimeline" TEXT,
ADD COLUMN     "qGuarantee" TEXT,
ADD COLUMN     "qPaymentMethod" TEXT,
ADD COLUMN     "qHasPropertyToSell" BOOLEAN,
ADD COLUMN     "qMotive" TEXT,
ADD COLUMN     "qVisitAvailability" TEXT,
ADD COLUMN     "qAskedFields" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "qScore" INTEGER,
ADD COLUMN     "qScoreLabel" TEXT,
ADD COLUMN     "qBuyingSignalAt" TIMESTAMP(3),
ADD COLUMN     "qWantsStockAlert" BOOLEAN NOT NULL DEFAULT false;
