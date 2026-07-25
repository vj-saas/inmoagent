-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "sentByPersonId" TEXT;

-- CreateIndex
CREATE INDEX "Message_sentByPersonId_idx" ON "Message"("sentByPersonId");

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_sentByPersonId_fkey" FOREIGN KEY ("sentByPersonId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;
