-- AlterTable
ALTER TABLE "DirectMessageDocument" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "replyToMessageId" TEXT;

-- AlterTable
ALTER TABLE "GroupMessageDocument" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "replyToMessageId" TEXT;

-- AlterTable
ALTER TABLE "TripDocument" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "replyToMessageId" TEXT;

-- AddForeignKey
ALTER TABLE "TripDocument" ADD CONSTRAINT "TripDocument_replyToMessageId_fkey" FOREIGN KEY ("replyToMessageId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectMessageDocument" ADD CONSTRAINT "DirectMessageDocument_replyToMessageId_fkey" FOREIGN KEY ("replyToMessageId") REFERENCES "DirectMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupMessageDocument" ADD CONSTRAINT "GroupMessageDocument_replyToMessageId_fkey" FOREIGN KEY ("replyToMessageId") REFERENCES "GroupMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
