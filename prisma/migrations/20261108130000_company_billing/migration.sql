-- CreateEnum
CREATE TYPE "BillingStatus" AS ENUM ('TRIAL', 'PILOT', 'PAYING', 'OVERDUE', 'DEACTIVATED');

-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "adminNote" TEXT,
ADD COLUMN     "billingStatus" "BillingStatus" NOT NULL DEFAULT 'TRIAL',
ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'EUR',
ADD COLUMN     "pilotEndsAt" TIMESTAMP(3),
ADD COLUMN     "pricePerTruck" DECIMAL(10,2);

-- Companies that are already switched off start as DEACTIVATED.
UPDATE "Company" SET "billingStatus" = 'DEACTIVATED' WHERE "isActive" = false;
