import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateMessageDto } from './dto/create-message.dto';
import { TranslationService } from 'src/translation/translation.service';
import { TripChatSessionsService } from './trip-chat-sessions.service';
import { PushService } from '../push/push.service';
import { Inject, forwardRef } from '@nestjs/common';
import { MessagesGateway } from './messages.gateway';
import { ReactionsService } from '../reactions/reactions.service';
import { fullName } from '../common/utils/full-name';

@Injectable()
export class MessagesService {
  private readonly logger = new Logger(MessagesService.name);
  constructor(
    private prisma: PrismaService,
    private translation: TranslationService,
    private sessions: TripChatSessionsService,
    private push: PushService,
    @Inject(forwardRef(() => MessagesGateway))
    private gateway: MessagesGateway,
    private reactions: ReactionsService,
  ) {}
  async create(senderId: string, dto: CreateMessageDto) {
    // Privacy: only the trip's current driver or current manager may write.
    // Otherwise an old participant could still post into the active session
    // they're no longer part of (and the new participants would receive it).
    const trip = await this.prisma.trip.findUnique({
      where: { id: dto.tripId },
      include: {
        driver: { select: { id: true, language: true } },
        manager: { select: { id: true, language: true } },
      },
    });
    if (!trip) throw new NotFoundException('Рейс не знайдений');
    if (senderId !== trip.driverId && senderId !== trip.managerId) {
      throw new ForbiddenException(
        'Тільки поточний водій або менеджер можуть писати в цей чат',
      );
    }

    let translatedContent: string | null = null;

    if (dto.translate) {
      // Визначаємо мову отримувача
      const receiver =
        trip.driverId === senderId ? trip.manager : trip.driver;
      const receiverLanguage = receiver?.language || 'EN';

      // Перекладаємо
      const targetCode = this.translation.getLanguageCode(receiverLanguage);
      translatedContent = await this.translation.translateText(
        dto.content,
        targetCode,
      );
    }

    const session = await this.sessions.getActiveSessionOrThrow(dto.tripId);

    const message = await this.prisma.message.create({
      data: {
        tripId: dto.tripId,
        sessionId: session.id,
        senderId,
        content: dto.content,
        translatedContent,
        replyToId: dto.replyToId ?? null,
        replyToDocumentId: dto.replyToDocumentId ?? null,
      },
      include: {
        sender: {
          select: { id: true, firstName: true, lastName: true, avatar: true, role: true },
        },
        // Recipients filter on the client side: drop the message if my id is
        // neither driverId nor managerId (and I'm not a manager-tier user).
        session: {
          select: { driverId: true, managerId: true },
        },
        replyTo: {
          select: {
            id: true,
            content: true,
            deletedAt: true,
            sender: { select: { id: true, firstName: true, lastName: true, avatar: true } },
          },
        },
        replyToDocument: {
          select: {
            id: true,
            fileName: true,
            fileType: true,
            deletedAt: true,
            uploader: { select: { id: true, firstName: true, lastName: true, avatar: true } },
          },
        },
      },
    });

    // Push the OTHER session participant only when they are NOT online
    // (no live socket). Online recipients already get the message via the
    // `newMessage` socket event — a push would just blink the banner.
    const recipientId =
      senderId === trip.driverId ? trip.managerId : trip.driverId;
    if (recipientId) {
      void (async () => {
        const online = await this.gateway.isUserOnline(recipientId);
        if (online) return;
        await this.push.sendToUsers([recipientId], {
          title: fullName(message.sender) || 'Нове повідомлення',
          body: dto.content.slice(0, 200),
          data: {
            type: 'MESSAGE',
            tripId: dto.tripId,
            messageId: message.id,
          },
        });
      })();
    }

    return message;
  }

  // 15-min edit window — author-only, rejects deleted/system messages and
  // stale edits. Returns the updated message ready for emit to the trip room.
  async editMessage(messageId: string, userId: string, content: string) {
    const trimmed = content.trim();
    if (!trimmed) {
      throw new ForbiddenException('Повідомлення не може бути порожнім');
    }
    const msg = await this.prisma.message.findUnique({
      where: { id: messageId },
    });
    if (!msg) throw new NotFoundException('Повідомлення не знайдене');
    if (msg.senderId !== userId) {
      throw new ForbiddenException('Ви можете редагувати лише свої повідомлення');
    }
    if (msg.deletedAt) {
      throw new ForbiddenException('Не можна редагувати видалене повідомлення');
    }
    if (msg.isSystem) {
      throw new ForbiddenException('Системні повідомлення не редагуються');
    }
    const ageMs = Date.now() - msg.createdAt.getTime();
    if (ageMs > 15 * 60 * 1000) {
      throw new ForbiddenException('Час на редагування минув (15 хв)');
    }
    return this.prisma.message.update({
      where: { id: messageId },
      data: { content: trimmed, editedAt: new Date() },
      include: {
        sender: { select: { id: true, firstName: true, lastName: true, avatar: true, role: true } },
        session: { select: { driverId: true, managerId: true } },
        replyTo: {
          select: {
            id: true,
            content: true,
            deletedAt: true,
            sender: { select: { id: true, firstName: true, lastName: true, avatar: true } },
          },
        },
        replyToDocument: {
          select: {
            id: true,
            fileName: true,
            fileType: true,
            deletedAt: true,
            uploader: { select: { id: true, firstName: true, lastName: true, avatar: true } },
          },
        },
      },
    });
  }

  // Drivers can only delete their own; managers can delete any. Returns the
  // tripId so the controller can broadcast `messageDeleted` to the room.
  async remove(
    id: string,
    userId: string,
    userRole: string,
  ): Promise<{ tripId: string }> {
    const msg = await this.prisma.message.findUnique({ where: { id } });
    if (!msg) throw new NotFoundException('Повідомлення не знайдене');

    const isManager = ['ADMIN', 'TEAMLEAD', 'MANAGER'].includes(userRole);
    if (!isManager && msg.senderId !== userId) {
      throw new ForbiddenException('Ви не можете видалити це повідомлення');
    }

    // Soft delete — keep the row so the bubble can show "Message deleted".
    await this.prisma.message.update({
      where: { id },
      data: { deletedAt: new Date(), content: "" },
    });
    return { tripId: msg.tripId };
  }

  // Unread summary for the manager — one DB round-trip,
  // grouped by truck, split into active-trip vs past-trip buckets.
  async getUnreadSummary(
    companyId: string,
    requesterId: string,
    requesterRole: string,
  ) {
    const ACTIVE_STATUSES = [
      'ASSIGNED', 'ACCEPTED', 'ON_WAY', 'ON_SITE', 'LOADED',
    ] as const;

    const isAdminTier =
      requesterRole === 'ADMIN' || requesterRole === 'TEAMLEAD';

    // Privacy: requester counts unread only for sessions they participated
    // in. Admin/Teamlead see everything in their company.
    const allUnread = await this.prisma.message.findMany({
      where: {
        trip: { companyId },
        isRead: false,
        senderId: { not: requesterId },
        ...(isAdminTier
          ? {}
          : {
              session: {
                OR: [
                  { driverId: requesterId },
                  { managerId: requesterId },
                ],
              },
            }),
      },
      select: {
        id: true,
        content: true,
        createdAt: true,
        tripId: true,
        sender: { select: { firstName: true, lastName: true, avatar: true } },
        trip: {
          select: {
            status: true,
            truckId: true,
            truck: { select: { plate: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    type TruckEntry = {
      plate: string;
      activeTripUnread: number;
      pastTripsUnread: number;
      tripUnread: Record<string, number>;
      latestMessage: {
        content: string;
        senderName: string;
        tripId: string;
        isActiveTrip: boolean;
        createdAt: string;
      } | null;
    };

    const truckMap = new Map<string, TruckEntry>();

    for (const msg of allUnread) {
      const { trip } = msg;

      const isActive = (ACTIVE_STATUSES as readonly string[]).includes(trip.status);
      const { truckId } = trip;

      if (!truckMap.has(truckId)) {
        truckMap.set(truckId, {
          plate: trip.truck.plate,
          activeTripUnread: 0,
          pastTripsUnread: 0,
          tripUnread: {},
          latestMessage: null,
        });
      }

      const entry = truckMap.get(truckId)!;

      if (isActive) entry.activeTripUnread++;
      else entry.pastTripsUnread++;

      entry.tripUnread[msg.tripId] = (entry.tripUnread[msg.tripId] ?? 0) + 1;

      // Messages are sorted desc → first one per truck is the latest
      if (!entry.latestMessage) {
        entry.latestMessage = {
          content: msg.content,
          senderName: fullName(msg.sender) || 'Driver',
          tripId: msg.tripId,
          isActiveTrip: isActive,
          createdAt: msg.createdAt.toISOString(),
        };
      }
    }

    const items = [...truckMap.entries()]
      .map(([truckId, data]) => ({
        truckId,
        plate: data.plate,
        totalUnread: data.activeTripUnread + data.pastTripsUnread,
        activeTripUnread: data.activeTripUnread,
        pastTripsUnread: data.pastTripsUnread,
        tripUnread: data.tripUnread,
        latestMessage: data.latestMessage,
      }))
      .sort((a, b) => b.totalUnread - a.totalUnread);

    return {
      total: items.reduce((s, i) => s + i.totalUnread, 0),
      items,
    };
  }

  // Unread summary for the driver — only their own trips, only messages from
  // others (managers / admin). Filters to the currently active session.
  async getDriverUnreadSummary(driverId: string) {
    const ACTIVE_STATUSES = [
      'ASSIGNED', 'ACCEPTED', 'ON_WAY', 'ON_SITE', 'LOADED',
    ] as const;

    // Privacy: driver counts unread only for sessions they were a driver in.
    const allUnread = await this.prisma.message.findMany({
      where: {
        trip: { driverId },
        isRead: false,
        senderId: { not: driverId },
        session: { driverId },
      },
      select: {
        id: true,
        tripId: true,
        content: true,
        createdAt: true,
        sender: { select: { firstName: true, lastName: true, avatar: true } },
        trip: {
          select: {
            status: true,
            title: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    type TripEntry = {
      unread: number;
      isActiveTrip: boolean;
      tripTitle: string;
      latestMessage: { content: string; senderName: string; createdAt: string } | null;
    };

    const tripMap = new Map<string, TripEntry>();
    let activeTripUnread = 0;
    let pastTripsUnread = 0;

    for (const msg of allUnread) {
      const isActive = (ACTIVE_STATUSES as readonly string[]).includes(msg.trip.status);

      if (!tripMap.has(msg.tripId)) {
        tripMap.set(msg.tripId, {
          unread: 0,
          isActiveTrip: isActive,
          tripTitle: msg.trip.title,
          latestMessage: null,
        });
      }

      const entry = tripMap.get(msg.tripId)!;
      entry.unread++;
      if (!entry.latestMessage) {
        entry.latestMessage = {
          content: msg.content,
          senderName: fullName(msg.sender) || 'Manager',
          createdAt: msg.createdAt.toISOString(),
        };
      }
      if (isActive) activeTripUnread++;
      else pastTripsUnread++;
    }

    const tripUnread: Record<string, number> = {};
    const items = [...tripMap.entries()].map(([tripId, data]) => {
      tripUnread[tripId] = data.unread;
      return {
        tripId,
        unread: data.unread,
        isActiveTrip: data.isActiveTrip,
        tripTitle: data.tripTitle,
        latestMessage: data.latestMessage,
      };
    });

    return {
      total: activeTripUnread + pastTripsUnread,
      activeTripUnread,
      pastTripsUnread,
      tripUnread,
      items,
    };
  }

  async findByTrip(tripId: string, requester: { id: string; role: string }) {
    const t0 = Date.now();
    // Privacy: requester sees only sessions they participated in.
    // Managers (ADMIN/TEAMLEAD) see all sessions of the trip.
    const sessionIds = await this.sessions.getVisibleSessionIds(tripId, requester);
    const tSessions = Date.now() - t0;
    if (sessionIds.length === 0) return [];

    const t1 = Date.now();
    const messages = await this.prisma.message.findMany({
      where: { sessionId: { in: sessionIds } },
      include: {
        sender: { select: { id: true, firstName: true, lastName: true, avatar: true, role: true } },
        // Phase 5 fields: clients (web + driver) need these populated on
        // initial fetch so the bubble can render quote + reactions without
        // waiting for the next WS event.
        replyTo: {
          select: {
            id: true,
            content: true,
            deletedAt: true,
            sender: { select: { id: true, firstName: true, lastName: true, avatar: true } },
          },
        },
        replyToDocument: {
          select: {
            id: true,
            fileName: true,
            fileType: true,
            deletedAt: true,
            uploader: { select: { id: true, firstName: true, lastName: true, avatar: true } },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
    const tMessages = Date.now() - t1;

    const t2 = Date.now();
    const reactionsByMsg = await this.reactions.getForMessages(
      'TRIP',
      messages.map((m) => m.id),
    );
    const tReactions = Date.now() - t2;

    this.logger.log(
      `findByTrip ${tripId} → sessions=${tSessions}ms messages=${tMessages}ms reactions=${tReactions}ms count=${messages.length}`,
    );
    return messages.map((m) => ({
      ...m,
      reactions: reactionsByMsg[m.id] ?? [],
    }));
  }

  // Mark every unread message AND document in a trip *not authored/uploaded
  // by* `readerId` as read. Returns the IDs that were just flipped, so the
  // gateway can emit a precise event to the senders rather than refetching
  // the whole history.
  async markTripRead(
    tripId: string,
    readerId: string,
    readerRole: string,
  ): Promise<{ messageIds: string[]; documentIds: string[] }> {
    const sessionIds = await this.sessions.getVisibleSessionIds(tripId, {
      id: readerId,
      role: readerRole,
    });
    const [unreadMessages, unreadDocs] = await Promise.all([
      sessionIds.length > 0
        ? this.prisma.message.findMany({
            where: {
              sessionId: { in: sessionIds },
              isRead: false,
              senderId: { not: readerId },
            },
            select: { id: true },
          })
        : Promise.resolve([] as { id: string }[]),
      this.prisma.tripDocument.findMany({
        where: { tripId, isRead: false, uploadedBy: { not: readerId } },
        select: { id: true },
      }),
    ]);

    const messageIds = unreadMessages.map((m) => m.id);
    const documentIds = unreadDocs.map((d) => d.id);

    await Promise.all([
      messageIds.length > 0
        ? this.prisma.message.updateMany({
            where: { id: { in: messageIds } },
            data: { isRead: true },
          })
        : Promise.resolve(),
      documentIds.length > 0
        ? this.prisma.tripDocument.updateMany({
            where: { id: { in: documentIds } },
            data: { isRead: true },
          })
        : Promise.resolve(),
    ]);

    return { messageIds, documentIds };
  }
}
