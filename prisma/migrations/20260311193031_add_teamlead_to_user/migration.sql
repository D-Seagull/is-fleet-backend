-- AlterTable
ALTER TABLE "User" ADD COLUMN     "teamleadId" TEXT;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_teamleadId_fkey" FOREIGN KEY ("teamleadId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
