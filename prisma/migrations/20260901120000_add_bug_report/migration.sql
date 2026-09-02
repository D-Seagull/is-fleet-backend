-- CreateEnum
CREATE TYPE "BugStatus" AS ENUM ('NEW', 'TRIAGED', 'RESOLVED');

-- CreateTable
CREATE TABLE "BugReport" (
    "id" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "companyId" TEXT,
    "role" "Role" NOT NULL,
    "description" TEXT NOT NULL,
    "screenshots" TEXT[],
    "appName" TEXT,
    "appVersion" TEXT,
    "platform" TEXT,
    "route" TEXT,
    "socketState" TEXT,
    "status" "BugStatus" NOT NULL DEFAULT 'NEW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "BugReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BugReport_status_createdAt_idx" ON "BugReport"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "BugReport" ADD CONSTRAINT "BugReport_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BugReport" ADD CONSTRAINT "BugReport_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;
