-- Self-set presence status. ONLINE is the default; BUSY and SLEEP both
-- suppress push notifications. Existing users start as ONLINE so no
-- behavioural change for the current cohort.
CREATE TYPE "UserStatus" AS ENUM ('ONLINE', 'BUSY', 'SLEEP');

ALTER TABLE "User" ADD COLUMN "status" "UserStatus" NOT NULL DEFAULT 'ONLINE';
ALTER TABLE "User" ADD COLUMN "statusUntil" TIMESTAMP(3);
