-- Hot filter columns that had no index: every company-scoped list
-- (trips / trucks / users by companyId), a driver's or truck's active trip,
-- and the once-a-minute depart-prompt sweep. Indexes only — no data change.
-- Names follow Prisma's convention so the schema stays in sync.
CREATE INDEX IF NOT EXISTS "User_companyId_role_idx" ON "User"("companyId", "role");
CREATE INDEX IF NOT EXISTS "Truck_companyId_idx" ON "Truck"("companyId");
CREATE INDEX IF NOT EXISTS "Trip_companyId_idx" ON "Trip"("companyId");
CREATE INDEX IF NOT EXISTS "Trip_driverId_status_idx" ON "Trip"("driverId", "status");
CREATE INDEX IF NOT EXISTS "Trip_truckId_status_idx" ON "Trip"("truckId", "status");
CREATE INDEX IF NOT EXISTS "Trip_departPromptAt_idx" ON "Trip"("departPromptAt");
