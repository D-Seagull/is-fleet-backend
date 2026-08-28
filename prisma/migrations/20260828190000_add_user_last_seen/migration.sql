-- Add last-seen timestamp for the presence "away" tier (offline < 7d → amber).
ALTER TABLE "User" ADD COLUMN "lastSeenAt" TIMESTAMP(3);
