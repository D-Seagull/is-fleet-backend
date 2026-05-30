-- AlterTable
ALTER TABLE "DirectMessage" ADD COLUMN     "editedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "GroupMessage" ADD COLUMN     "editedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "editedAt" TIMESTAMP(3);
