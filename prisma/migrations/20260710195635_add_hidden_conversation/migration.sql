-- CreateTable
CREATE TABLE "HiddenConversation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "peerId" TEXT NOT NULL,
    "hiddenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HiddenConversation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HiddenConversation_userId_idx" ON "HiddenConversation"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "HiddenConversation_userId_peerId_key" ON "HiddenConversation"("userId", "peerId");

-- AddForeignKey
ALTER TABLE "HiddenConversation" ADD CONSTRAINT "HiddenConversation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

