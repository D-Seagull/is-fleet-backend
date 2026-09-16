-- Soft-delete for trips. Nullable with no default, so Postgres records it in
-- the catalogue without rewriting the table and without touching a single row.
--
-- Deployed code that predates this column simply never selects it, which is why
-- this is safe to apply before the application rolls out.
ALTER TABLE "Trip" ADD COLUMN "deletedAt" TIMESTAMP(3);

-- Every listing filters on `deletedAt IS NULL`, and live trips are the
-- overwhelming majority — a partial index keeps that cheap without indexing
-- rows nobody queries.
CREATE INDEX "Trip_deletedAt_idx" ON "Trip" ("deletedAt") WHERE "deletedAt" IS NULL;
