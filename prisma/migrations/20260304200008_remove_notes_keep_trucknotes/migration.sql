/*
  Warnings:

  - You are about to drop the column `notes` on the `Truck` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Truck" DROP COLUMN "notes";

-- CreateTable
CREATE TABLE "TruckNote" (
    "id" TEXT NOT NULL,
    "truckId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TruckNote_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "TruckNote" ADD CONSTRAINT "TruckNote_truckId_fkey" FOREIGN KEY ("truckId") REFERENCES "Truck"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TruckNote" ADD CONSTRAINT "TruckNote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
