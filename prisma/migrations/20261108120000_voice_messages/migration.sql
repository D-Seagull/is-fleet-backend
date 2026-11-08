-- Voice messages: a new attachment kind plus the recording length.
-- Additive only: existing rows keep their fileType and get NULL durationMs.
ALTER TYPE "FileDocType" ADD VALUE IF NOT EXISTS 'AUDIO';

ALTER TABLE "TripDocument" ADD COLUMN "durationMs" INTEGER;
ALTER TABLE "DirectMessageDocument" ADD COLUMN "durationMs" INTEGER;
ALTER TABLE "GroupMessageDocument" ADD COLUMN "durationMs" INTEGER;
