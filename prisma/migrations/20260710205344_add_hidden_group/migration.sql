-- CreateTable
CREATE TABLE "HiddenGroup" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "hiddenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HiddenGroup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HiddenGroup_userId_idx" ON "HiddenGroup"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "HiddenGroup_userId_groupId_key" ON "HiddenGroup"("userId", "groupId");

-- AddForeignKey
ALTER TABLE "HiddenGroup" ADD CONSTRAINT "HiddenGroup_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

