import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

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
      throw new BadRequestException(`Unsupported emoji: ${emoji}`);
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
