-- Voice messages: loudness bars for the player ("12,40,33,..." 0-100 each).
ALTER TABLE "TripDocument" ADD COLUMN "waveform" TEXT;
ALTER TABLE "DirectMessageDocument" ADD COLUMN "waveform" TEXT;
ALTER TABLE "GroupMessageDocument" ADD COLUMN "waveform" TEXT;
