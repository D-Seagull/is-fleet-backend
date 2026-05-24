import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type ReactionTarget = 'TRIP' | 'DM' | 'GROUP';
const ALLOWED_EMOJI = ['👍', '😮', '😢'] as const;
export type AllowedEmoji = (typeof ALLOWED_EMOJI)[number];

export interface ReactionRow {
  id: string;
  userId: string;
  emoji: string;
}

@Injectable()
export class ReactionsService {
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

    const existing = await this.prisma.messageReaction.findUnique({
      where: {
        targetType_targetId_userId: { targetType, targetId, userId },
      },
    });

    if (existing) {
      if (existing.emoji === emoji) {
        await this.prisma.messageReaction.delete({
          where: { id: existing.id },
        });
      } else {
        await this.prisma.messageReaction.update({
          where: { id: existing.id },
          data: { emoji },
        });
      }
    } else {
      await this.prisma.messageReaction.create({
        data: { targetType, targetId, userId, emoji },
      });
    }

    return this.getForMessage(targetType, targetId);
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
