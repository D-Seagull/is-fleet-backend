-- Preview image for photo attachments (chat bubbles load this, not the full photo).
ALTER TABLE "TripDocument" ADD COLUMN "thumbPath" TEXT;
ALTER TABLE "DirectMessageDocument" ADD COLUMN "thumbPath" TEXT;
ALTER TABLE "GroupMessageDocument" ADD COLUMN "thumbPath" TEXT;
