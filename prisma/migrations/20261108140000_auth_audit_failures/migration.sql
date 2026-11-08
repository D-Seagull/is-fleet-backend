-- AlterEnum
ALTER TYPE "AuthAuditAction" ADD VALUE 'CODE_FAILED';
ALTER TYPE "AuthAuditAction" ADD VALUE 'CODE_LOCKED';
ALTER TYPE "AuthAuditAction" ADD VALUE 'DELIVERY_FAILED';

-- CreateIndex
CREATE INDEX "AuthAuditLog_createdAt_idx" ON "AuthAuditLog"("createdAt");
