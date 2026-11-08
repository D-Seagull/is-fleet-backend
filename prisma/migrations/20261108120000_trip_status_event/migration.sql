-- CreateTable
CREATE TABLE "TripStatusEvent" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "fromStatus" "TripStatus",
    "toStatus" "TripStatus" NOT NULL,
    "actorId" TEXT,
    "actorRole" "Role",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TripStatusEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TripStatusEvent_companyId_createdAt_idx" ON "TripStatusEvent"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "TripStatusEvent_tripId_createdAt_idx" ON "TripStatusEvent"("tripId", "createdAt");

-- AddForeignKey
ALTER TABLE "TripStatusEvent" ADD CONSTRAINT "TripStatusEvent_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Same lockdown as the other tables (see enable_row_level_security).
ALTER TABLE "TripStatusEvent" ENABLE ROW LEVEL SECURITY;
