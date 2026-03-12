-- AlterTable
ALTER TABLE "User" ADD COLUMN     "dispatcherId" TEXT;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_dispatcherId_fkey" FOREIGN KEY ("dispatcherId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
