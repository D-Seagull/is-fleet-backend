-- "Fill from order": the trip's order file (managers only) + an idempotency
-- key for trip creation. Additive only: one new table, one nullable column.

-- AlterTable
ALTER TABLE "Trip" ADD COLUMN "importKey" TEXT;

-- CreateTable
CREATE TABLE "TripOrderFile" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "TripOrderFile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Trip_importKey_key" ON "Trip"("importKey");

-- CreateIndex
CREATE INDEX "TripOrderFile_tripId_deletedAt_idx" ON "TripOrderFile"("tripId", "deletedAt");

-- AddForeignKey
ALTER TABLE "TripOrderFile" ADD CONSTRAINT "TripOrderFile_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripOrderFile" ADD CONSTRAINT "TripOrderFile_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
