-- Trip money side (freight, km, tolls), managers only. Additive: one new table.

-- CreateTable
CREATE TABLE "TripFinance" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "freightRate" DECIMAL(12,2),
    "currency" TEXT,
    "loadedKm" INTEGER,
    "emptyKm" INTEGER,
    "tolls" DECIMAL(12,2),
    "updatedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TripFinance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TripFinance_tripId_key" ON "TripFinance"("tripId");

-- AddForeignKey
ALTER TABLE "TripFinance" ADD CONSTRAINT "TripFinance_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripFinance" ADD CONSTRAINT "TripFinance_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
