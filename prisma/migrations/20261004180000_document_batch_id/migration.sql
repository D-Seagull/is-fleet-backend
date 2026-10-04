-- Albums: files uploaded in one message share a batchId.
ALTER TABLE "TripDocument" ADD COLUMN "batchId" TEXT;
ALTER TABLE "DirectMessageDocument" ADD COLUMN "batchId" TEXT;
ALTER TABLE "GroupMessageDocument" ADD COLUMN "batchId" TEXT;

CREATE INDEX "TripDocument_batchId_idx" ON "TripDocument"("batchId");
CREATE INDEX "DirectMessageDocument_batchId_idx" ON "DirectMessageDocument"("batchId");
CREATE INDEX "GroupMessageDocument_batchId_idx" ON "GroupMessageDocument"("batchId");
