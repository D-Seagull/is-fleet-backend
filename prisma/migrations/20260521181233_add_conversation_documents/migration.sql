-- CreateTable
CREATE TABLE "DirectMessageDocument" (
    "id" TEXT NOT NULL,
    "uploadedBy" TEXT NOT NULL,
    "otherUserId" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileType" "FileDocType" NOT NULL DEFAULT 'DOCUMENT',
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publicId" TEXT,

    CONSTRAINT "DirectMessageDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupMessageDocument" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "uploadedBy" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileType" "FileDocType" NOT NULL DEFAULT 'DOCUMENT',
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publicId" TEXT,

    CONSTRAINT "GroupMessageDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DirectMessageDocument_uploadedBy_otherUserId_idx" ON "DirectMessageDocument"("uploadedBy", "otherUserId");

-- CreateIndex
CREATE INDEX "DirectMessageDocument_otherUserId_uploadedBy_idx" ON "DirectMessageDocument"("otherUserId", "uploadedBy");

-- CreateIndex
CREATE INDEX "GroupMessageDocument_groupId_idx" ON "GroupMessageDocument"("groupId");

-- CreateIndex
CREATE INDEX "GroupMessageDocument_uploadedBy_idx" ON "GroupMessageDocument"("uploadedBy");

-- AddForeignKey
ALTER TABLE "DirectMessageDocument" ADD CONSTRAINT "DirectMessageDocument_uploadedBy_fkey" FOREIGN KEY ("uploadedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectMessageDocument" ADD CONSTRAINT "DirectMessageDocument_otherUserId_fkey" FOREIGN KEY ("otherUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupMessageDocument" ADD CONSTRAINT "GroupMessageDocument_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupMessageDocument" ADD CONSTRAINT "GroupMessageDocument_uploadedBy_fkey" FOREIGN KEY ("uploadedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
