-- Android notification channels the installed app version has created.
-- The backend sends to a newer channel (e.g. "chat", "alarm") only when the
-- device reported it; older builds keep getting the old ones.
ALTER TABLE "PushToken" ADD COLUMN "channels" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
