-- AlterEnum
-- Adds the DRIVERS variant to GroupType so a company can have a default
-- all-drivers group. Enum value additions can't run inside a transaction on
-- Postgres, so this migration contains only the single ALTER.
ALTER TYPE "GroupType" ADD VALUE 'DRIVERS';
