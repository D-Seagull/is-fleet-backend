-- Marks a self-erased account (GDPR / app-store requirement). The row stays so
-- trips, messages and manager links keep a valid FK; personal fields are
-- scrubbed instead. Distinct from isActive=false, which is reversible.
ALTER TABLE "User" ADD COLUMN "deletedAt" TIMESTAMP(3);
