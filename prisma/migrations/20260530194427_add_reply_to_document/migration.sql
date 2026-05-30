-- AlterTable
ALTER TABLE "DirectMessage" ADD COLUMN     "replyToDocumentId" TEXT;

-- AlterTable
ALTER TABLE "DirectMessageDocument" ADD COLUMN     "replyToDocumentId" TEXT;

-- AlterTable
ALTER TABLE "GroupMessage" ADD COLUMN     "replyToDocumentId" TEXT;

-- AlterTable
ALTER TABLE "GroupMessageDocument" ADD COLUMN     "replyToDocumentId" TEXT;

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "replyToDocumentId" TEXT;

-- AlterTable
ALTER TABLE "TripDocument" ADD COLUMN     "replyToDocumentId" TEXT;

-- AddForeignKey
ALTER TABLE "TripDocument" ADD CONSTRAINT "TripDocument_replyToDocumentId_fkey" FOREIGN KEY ("replyToDocumentId") REFERENCES "TripDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectMessageDocument" ADD CONSTRAINT "DirectMessageDocument_replyToDocumentId_fkey" FOREIGN KEY ("replyToDocumentId") REFERENCES "DirectMessageDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupMessageDocument" ADD CONSTRAINT "GroupMessageDocument_replyToDocumentId_fkey" FOREIGN KEY ("replyToDocumentId") REFERENCES "GroupMessageDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectMessage" ADD CONSTRAINT "DirectMessage_replyToDocumentId_fkey" FOREIGN KEY ("replyToDocumentId") REFERENCES "DirectMessageDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_replyToDocumentId_fkey" FOREIGN KEY ("replyToDocumentId") REFERENCES "TripDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupMessage" ADD CONSTRAINT "GroupMessage_replyToDocumentId_fkey" FOREIGN KEY ("replyToDocumentId") REFERENCES "GroupMessageDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;
