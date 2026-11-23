-- Per-company AI switch (platform ADMIN). Additive; existing companies start off.

-- AlterTable
ALTER TABLE "Company" ADD COLUMN "aiEnabled" BOOLEAN NOT NULL DEFAULT false;
