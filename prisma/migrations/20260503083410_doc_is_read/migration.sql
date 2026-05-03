-- AlterTable
ALTER TABLE "TripDocument" ADD COLUMN     "isRead" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "TripDocument_tripId_isRead_idx" ON "TripDocument"("tripId", "isRead");
