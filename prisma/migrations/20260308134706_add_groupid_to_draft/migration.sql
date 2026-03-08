-- AlterTable
ALTER TABLE "Announcement" ADD COLUMN     "isTemplate" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "AnnouncementDraft" ADD COLUMN     "groupId" TEXT;

-- AddForeignKey
ALTER TABLE "AnnouncementDraft" ADD CONSTRAINT "AnnouncementDraft_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE SET NULL ON UPDATE CASCADE;
