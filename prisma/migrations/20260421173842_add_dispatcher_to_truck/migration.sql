-- AlterTable
ALTER TABLE "Truck" ADD COLUMN     "dispatcherId" TEXT;

-- AddForeignKey
ALTER TABLE "Truck" ADD CONSTRAINT "Truck_dispatcherId_fkey" FOREIGN KEY ("dispatcherId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
