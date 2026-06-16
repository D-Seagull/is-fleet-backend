-- Split User.name into firstName (required) + lastName (optional)

-- 1. Add new columns nullable so existing rows survive
ALTER TABLE "User" ADD COLUMN "firstName" TEXT;
ALTER TABLE "User" ADD COLUMN "lastName" TEXT;

-- 2. Backfill from existing name:
--    "Dmytro Chaika" -> firstName="Dmytro", lastName="Chaika"
--    "Vasia"         -> firstName="Vasia",  lastName=NULL
-- NOTE: POSITION returns 0 when no space found; we guard with CASE so single-word
-- names get lastName=NULL instead of duplicating firstName.
UPDATE "User"
SET "firstName" = SPLIT_PART("name", ' ', 1),
    "lastName"  = CASE
      WHEN POSITION(' ' IN "name") = 0 THEN NULL
      ELSE NULLIF(TRIM(SUBSTRING("name" FROM POSITION(' ' IN "name") + 1)), '')
    END
WHERE "name" IS NOT NULL;

-- 3. Safety net: any row that still lacks firstName gets a placeholder
--    (current data has 0 NULLs, so this is a no-op now; future-proofing only)
UPDATE "User" SET "firstName" = 'Unknown' WHERE "firstName" IS NULL;

-- 4. Lock firstName to NOT NULL now that all rows are populated
ALTER TABLE "User" ALTER COLUMN "firstName" SET NOT NULL;

-- 5. Drop legacy column
ALTER TABLE "User" DROP COLUMN "name";
