-- AlterEnum
ALTER TYPE "StopType" ADD VALUE 'WAYPOINT';

-- AlterTable
ALTER TABLE "TripStop" ADD COLUMN     "name" TEXT;

-- Backfill: перенумерувати наявні (легасі) стопи в єдиний глобальний порядок по кожному рейсу.
-- Раніше order був per-type (LOADING 0,1 та UNLOADING 0,1 могли збігатися). Для єдиного
-- упорядкованого списку нумеруємо послідовно: спершу LOADING, потім UNLOADING.
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY "tripId"
      ORDER BY (CASE WHEN "type" = 'LOADING' THEN 0 ELSE 1 END), "order", "id"
    ) - 1 AS rn
  FROM "TripStop"
)
UPDATE "TripStop" t
SET "order" = r.rn
FROM ranked r
WHERE t.id = r.id;
