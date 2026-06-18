-- Add an avatar (and the Supabase storage handle so we can clean it up
-- when the group resets its picture). Both nullable — existing rows keep
-- their classic "#" placeholder until someone uploads a real image.
ALTER TABLE "Group" ADD COLUMN "avatar" TEXT;
ALTER TABLE "Group" ADD COLUMN "avatarPublicId" TEXT;
