import { NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

/**
 * The conversation a new message / file lives in. A reply may only quote a
 * message or file of the SAME conversation — the quoted text is embedded in
 * the response and in everyone's timeline, so a foreign id would leak another
 * chat's (or company's) message (audit M1).
 */
export type ReplyScope =
  | { trip: string }
  | { dm: [string, string] }
  | { group: string };

type ReplyIds = { messageId?: unknown; documentId?: unknown };

const present = (v: unknown) => v !== undefined && v !== null && v !== '';
const isId = (v: unknown): v is string =>
  typeof v === 'string' && v.length > 0 && v.length <= 64;

/**
 * 404 unless every given reply target belongs to `scope`. Absent ids (null,
 * undefined, '') are fine — not every message is a reply.
 */
export async function assertReplyTargets(
  prisma: PrismaService,
  scope: ReplyScope,
  { messageId, documentId }: ReplyIds,
): Promise<void> {
  if (present(messageId)) {
    if (!isId(messageId) || !(await messageInScope(prisma, scope, messageId))) {
      throw new NotFoundException('errors.messageNotFound');
    }
  }
  if (present(documentId)) {
    if (
      !isId(documentId) ||
      !(await documentInScope(prisma, scope, documentId))
    ) {
      throw new NotFoundException('errors.documentNotFound');
    }
  }
}

async function messageInScope(
  prisma: PrismaService,
  scope: ReplyScope,
  id: string,
): Promise<boolean> {
  if ('trip' in scope) {
    return !!(await prisma.message.findFirst({
      where: { id, tripId: scope.trip },
      select: { id: true },
    }));
  }
  if ('group' in scope) {
    return !!(await prisma.groupMessage.findFirst({
      where: { id, groupId: scope.group },
      select: { id: true },
    }));
  }
  const [a, b] = scope.dm;
  return !!(await prisma.directMessage.findFirst({
    where: {
      id,
      OR: [
        { senderId: a, receiverId: b },
        { senderId: b, receiverId: a },
      ],
    },
    select: { id: true },
  }));
}

async function documentInScope(
  prisma: PrismaService,
  scope: ReplyScope,
  id: string,
): Promise<boolean> {
  if ('trip' in scope) {
    return !!(await prisma.tripDocument.findFirst({
      where: { id, tripId: scope.trip },
      select: { id: true },
    }));
  }
  if ('group' in scope) {
    return !!(await prisma.groupMessageDocument.findFirst({
      where: { id, groupId: scope.group },
      select: { id: true },
    }));
  }
  const [a, b] = scope.dm;
  return !!(await prisma.directMessageDocument.findFirst({
    where: {
      id,
      OR: [
        { uploadedBy: a, otherUserId: b },
        { uploadedBy: b, otherUserId: a },
      ],
    },
    select: { id: true },
  }));
}
