-- Audit M1: a reply could quote a message / file of ANOTHER conversation by
-- id, and the quoted text was returned with the reply. New writes are now
-- checked (src/common/utils/reply-targets.ts); this clears any reply pointer
-- already stored that leaves its own trip / DM pair / group, so old rows stop
-- leaking on read too. Legitimate replies never cross a conversation, so
-- nothing real is touched. Data only — no schema change.

-- Trip chat: same trip.
UPDATE "Message" m SET "replyToId" = NULL
  FROM "Message" r WHERE m."replyToId" = r."id" AND r."tripId" <> m."tripId";
UPDATE "Message" m SET "replyToDocumentId" = NULL
  FROM "TripDocument" d WHERE m."replyToDocumentId" = d."id" AND d."tripId" <> m."tripId";
UPDATE "TripDocument" t SET "replyToMessageId" = NULL
  FROM "Message" r WHERE t."replyToMessageId" = r."id" AND r."tripId" <> t."tripId";
UPDATE "TripDocument" t SET "replyToDocumentId" = NULL
  FROM "TripDocument" d WHERE t."replyToDocumentId" = d."id" AND d."tripId" <> t."tripId";

-- Group chat: same group.
UPDATE "GroupMessage" m SET "replyToId" = NULL
  FROM "GroupMessage" r WHERE m."replyToId" = r."id" AND r."groupId" <> m."groupId";
UPDATE "GroupMessage" m SET "replyToDocumentId" = NULL
  FROM "GroupMessageDocument" d WHERE m."replyToDocumentId" = d."id" AND d."groupId" <> m."groupId";
UPDATE "GroupMessageDocument" t SET "replyToMessageId" = NULL
  FROM "GroupMessage" r WHERE t."replyToMessageId" = r."id" AND r."groupId" <> t."groupId";
UPDATE "GroupMessageDocument" t SET "replyToDocumentId" = NULL
  FROM "GroupMessageDocument" d WHERE t."replyToDocumentId" = d."id" AND d."groupId" <> t."groupId";

-- DMs: the same two people, either direction.
UPDATE "DirectMessage" m SET "replyToId" = NULL
  FROM "DirectMessage" r WHERE m."replyToId" = r."id"
  AND NOT ((r."senderId" = m."senderId" AND r."receiverId" = m."receiverId")
        OR (r."senderId" = m."receiverId" AND r."receiverId" = m."senderId"));
UPDATE "DirectMessage" m SET "replyToDocumentId" = NULL
  FROM "DirectMessageDocument" d WHERE m."replyToDocumentId" = d."id"
  AND NOT ((d."uploadedBy" = m."senderId" AND d."otherUserId" = m."receiverId")
        OR (d."uploadedBy" = m."receiverId" AND d."otherUserId" = m."senderId"));
UPDATE "DirectMessageDocument" t SET "replyToMessageId" = NULL
  FROM "DirectMessage" r WHERE t."replyToMessageId" = r."id"
  AND NOT ((r."senderId" = t."uploadedBy" AND r."receiverId" = t."otherUserId")
        OR (r."senderId" = t."otherUserId" AND r."receiverId" = t."uploadedBy"));
UPDATE "DirectMessageDocument" t SET "replyToDocumentId" = NULL
  FROM "DirectMessageDocument" d WHERE t."replyToDocumentId" = d."id"
  AND NOT ((d."uploadedBy" = t."uploadedBy" AND d."otherUserId" = t."otherUserId")
        OR (d."uploadedBy" = t."otherUserId" AND d."otherUserId" = t."uploadedBy"));
