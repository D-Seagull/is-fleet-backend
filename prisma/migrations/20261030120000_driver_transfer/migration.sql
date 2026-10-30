-- Cross-company driver transfer needs the driver's consent (SMS link).
-- New table only; nothing existing is altered.
CREATE TABLE "DriverTransfer" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "fromCompanyId" TEXT NOT NULL,
    "toCompanyId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "declinedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DriverTransfer_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DriverTransfer_tokenHash_key" ON "DriverTransfer"("tokenHash");
CREATE INDEX "DriverTransfer_driverId_toCompanyId_idx" ON "DriverTransfer"("driverId", "toCompanyId");

ALTER TABLE "DriverTransfer" ADD CONSTRAINT "DriverTransfer_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DriverTransfer" ADD CONSTRAINT "DriverTransfer_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DriverTransfer" ADD CONSTRAINT "DriverTransfer_toCompanyId_fkey" FOREIGN KEY ("toCompanyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
