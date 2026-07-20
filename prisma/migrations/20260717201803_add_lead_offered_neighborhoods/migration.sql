-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "fOfferedNeighborhoods" TEXT[] DEFAULT ARRAY[]::TEXT[];
