import { Injectable, Logger } from '@nestjs/common';
import { DirectMessagesService } from '../direct-messages/direct-messages.service';
import { GroupMessagesService } from '../group-messages/group-messages.service';
import { MessagesService } from '../messages/messages.service';

/**
 * Aggregator for the /chat page's initial fetch.
 *
 * Runs the four independent summary queries in parallel on the shared
 * Prisma pool so wall time equals the slowest one (typically conversations)
 * instead of being the sum of all four. The trip-unread query branches by
 * role — driver app uses the same endpoint but lands on the driver flavour.
 */
@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly directMessages: DirectMessagesService,
    private readonly groupMessages: GroupMessagesService,
    private readonly messages: MessagesService,
  ) {}

  async getInit(
    userId: string,
    companyId: string,
    role: string,
  ) {
    const t0 = Date.now();

    const tripUnreadPromise =
      role === 'DRIVER'
        ? this.messages.getDriverUnreadSummary(userId)
        : this.messages.getUnreadSummary(companyId, userId, role);

    const [conversations, dmUnread, groupUnread, tripUnread] =
      await Promise.all([
        this.directMessages.getConversations(userId),
        this.directMessages.getUnreadSummary(userId),
        this.groupMessages.getUnreadSummary(userId),
        tripUnreadPromise,
      ]);

    this.logger.log(
      `getInit (${userId}, ${role}) → ${Date.now() - t0}ms (4 parallel)`,
    );

    return { conversations, dmUnread, groupUnread, tripUnread };
  }
}
