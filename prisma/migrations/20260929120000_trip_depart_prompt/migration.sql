-- "Are we heading to loading?" prompt state on a trip.
ALTER TABLE "Trip" ADD COLUMN "departPromptCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Trip" ADD COLUMN "departPromptAt" TIMESTAMP(3);
