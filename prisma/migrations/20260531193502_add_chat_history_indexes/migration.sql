-- CreateIndex
CREATE INDEX "DirectMessage_senderId_receiverId_createdAt_idx" ON "DirectMessage"("senderId", "receiverId", "createdAt");

-- CreateIndex
CREATE INDEX "DirectMessage_receiverId_senderId_createdAt_idx" ON "DirectMessage"("receiverId", "senderId", "createdAt");

-- CreateIndex
CREATE INDEX "DirectMessage_receiverId_isRead_idx" ON "DirectMessage"("receiverId", "isRead");

-- CreateIndex
CREATE INDEX "GroupMessage_groupId_createdAt_idx" ON "GroupMessage"("groupId", "createdAt");

-- CreateIndex
CREATE INDEX "Message_sessionId_createdAt_idx" ON "Message"("sessionId", "createdAt");
