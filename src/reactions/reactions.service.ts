import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  assertGroupAccess,
  assertTripAccess,
  type Requester,
} from '../common/utils/access';

export type ReactionTarget =
  | 'TRIP'
  | 'DM'
  | 'GROUP'
  | 'TRIP_DOC'
  | 'DM_DOC'
  | 'GROUP_DOC';
const ALLOWED_EMOJI = ['👍', '😮', '😢'] as const;
export type AllowedEmoji = (typeof ALLOWED_EMOJI)[number];

export interface ReactionRow {
  id: string;
  userId: string;
  emoji: string;
}

@Injectable()
export class ReactionsService {
  private readonly logger = new Logger(ReactionsService.name);
  constructor(private prisma: PrismaService) {}

  /**
   * Check that `requester` may see the message / file being reacted to and
   * return the socket rooms the change goes to. Trip → trip access, group →
   * group access, DM → one of the two people in the conversation. A miss is
   * 404 (no reacting to — or probing — another company's ids).
   */
  async assertTarget(
    targetType: ReactionTarget,
    targetId: string,
    requester: Requester,
  ): Promise<string[]> {
    const id = typeof targetId === 'string' ? targetId : '';
    const notFound = () =>
      new NotFoundException(
        targetType.endsWith('_DOC')
          ? 'errors.documentNotFound'
          : 'errors.messageNotFound',
      );
    switch (targetType) {
      case 'TRIP':
      case 'TRIP_DOC': {
        const row =
          targetType === 'TRIP'
            ? await this.prisma.message.findUnique({
                where: { id },
                select: { tripId: true },
              })
            : await this.prisma.tripDocument.findUnique({
                where: { id },
                select: { tripId: true },
              });
        if (!row) throw notFound();
        await assertTripAccess(this.prisma, row.tripId, requester).catch(() => {
          throw notFound();
        });
        return [row.tripId];
      }
      case 'GROUP':
      case 'GROUP_DOC': {
        const row =
          targetType === 'GROUP'
            ? await this.prisma.groupMessage.findUnique({
                where: { id },
                select: { groupId: true },
              })
            : await this.prisma.groupMessageDocument.findUnique({
                where: { id },
                select: { groupId: true },
              });
        if (!row) throw notFound();
        await assertGroupAccess(this.prisma, row.groupId, requester).catch(() => {
          throw notFound();
        });
        return [`group:${row.groupId}`];
      }
      case 'DM':
      case 'DM_DOC': {
        const ends =
          targetType === 'DM'
            ? await this.prisma.directMessage
                .findUnique({
                  where: { id },
                  select: { senderId: true, receiverId: true },
                })
                .then((m) => (m ? [m.senderId, m.receiverId] : null))
            : await this.prisma.directMessageDocument
                .findUnique({
                  where: { id },
                  select: { uploadedBy: true, otherUserId: true },
                })
                .then((d) => (d ? [d.uploadedBy, d.otherUserId] : null));
        if (!ends || !ends.includes(requester.id)) throw notFound();
        return ends.map((u) => `user:${u}`);
      }
    }
  }

  /**
   * Toggle a user's reaction on a message:
   *   - same emoji already set → remove (toggle off)
   *   - different emoji set    → replace
   *   - nothing set            → create
   * Returns the full list of reactions on the message after the change.
   */
  async toggle(
    targetType: ReactionTarget,
    targetId: string,
    userId: string,
    emoji: string,
  ): Promise<ReactionRow[]> {
    if (!ALLOWED_EMOJI.includes(emoji as AllowedEmoji)) {
      throw new BadRequestException('errors.unsupportedEmoji');
    }
    const t0 = Date.now();

    // Single interactive transaction — Prisma pipelines the queries to the
    // pgbouncer round-trip, cutting "toggle" from 3 × ~400ms down to ~1 ×.
    //
    // The 4 toggle cases collapse into:
    //   - delete old (deletes 0 or 1 row, equivalent to "remove if same
    //     emoji OR replace later")
    //   - upsert(emoji) only when we WANT a row to exist afterwards
    //   - read all
    //
    // To stay correct we read existing first, decide, then write — but all
    // inside one transaction so the cost is one network hop (≈ 400ms).
    const reactions = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.messageReaction.findUnique({
        where: {
          targetType_targetId_userId: { targetType, targetId, userId },
        },
        select: { id: true, emoji: true },
      });

      if (existing) {
        if (existing.emoji === emoji) {
          // Same emoji → toggle off.
          await tx.messageReaction.delete({ where: { id: existing.id } });
        } else {
          // Different emoji → replace.
          await tx.messageReaction.update({
            where: { id: existing.id },
            data: { emoji },
          });
        }
      } else {
        await tx.messageReaction.create({
          data: { targetType, targetId, userId, emoji },
        });
      }

      return tx.messageReaction.findMany({
        where: { targetType, targetId },
        select: { id: true, userId: true, emoji: true },
      });
    });

    const total = Date.now() - t0;
    this.logger.log(
      `toggle ${targetType} ${targetId} → tx=${total}ms (${reactions.length} reactions)`,
    );
    return reactions;
  }

  /** All reactions on a single message. */
  async getForMessage(
    targetType: ReactionTarget,
    targetId: string,
  ): Promise<ReactionRow[]> {
    return this.prisma.messageReaction.findMany({
      where: { targetType, targetId },
      select: { id: true, userId: true, emoji: true },
    });
  }

  /**
   * Batch-fetch reactions for many message IDs at once — used in
   * getMessages to attach reactions[] to each message without N+1 queries.
   */
  async getForMessages(
    targetType: ReactionTarget,
    targetIds: string[],
  ): Promise<Record<string, ReactionRow[]>> {
    if (targetIds.length === 0) return {};
    const rows = await this.prisma.messageReaction.findMany({
      where: { targetType, targetId: { in: targetIds } },
      select: { id: true, targetId: true, userId: true, emoji: true },
    });
    const byMessage: Record<string, ReactionRow[]> = {};
    for (const r of rows) {
      const arr = byMessage[r.targetId] ?? (byMessage[r.targetId] = []);
      arr.push({ id: r.id, userId: r.userId, emoji: r.emoji });
    }
    return byMessage;
  }
}
