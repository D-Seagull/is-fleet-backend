import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateMessageDto } from './dto/create-message.dto';
import { TranslationService } from 'src/translation/translation.service';
import { TripChatSessionsService } from './trip-chat-sessions.service';
import { PushService } from '../push/push.service';
import { Inject, forwardRef } from '@nestjs/common';
import { MessagesGateway } from './messages.gateway';
import { fullName } from '../common/utils/full-name';

const ACTIVE_TRIP_STATUSES = [
  'ASSIGNED',
  'ACCEPTED',
  'ON_WAY',
  'ON_SITE',
  'LOADED',
] as const;

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
          select: { id: true, firstName: true, lastName: true, avatar: true, status: true, statusUntil: true, role: true },
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
        sender: { select: { id: true, firstName: true, lastName: true, avatar: true, status: true, statusUntil: true, role: true } },
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

  // Unread summary for the manager — grouped by truck, split into
  // active-trip vs past-trip buckets.
  //
  // 4-5 fixed-cost queries instead of one huge findMany over every unread
  // message in the company with sender + trip + truck joined:
  //  1. (managers only) collect the sessionIds requester participated in
  //  2. groupBy { tripId, _count } over unread messages in scope
  //  3. findMany trips → (truckId, status, plate)
  //  4. raw SQL ROW_NUMBER() → id of latest unread message per truck
  //  5. findMany on those ids with sender included
  async getUnreadSummary(
    companyId: string,
    requesterId: string,
    requesterRole: string,
  ) {
    const isAdminTier =
      requesterRole === 'ADMIN' || requesterRole === 'TEAMLEAD';

    let visibleSessionIds: string[] | null = null;
    if (!isAdminTier) {
      const sessions = await this.prisma.tripChatSession.findMany({
        where: {
          OR: [
            { driverId: requesterId },
            { managerId: requesterId },
          ],
        },
        select: { id: true },
      });
      if (sessions.length === 0) return { total: 0, items: [] };
      visibleSessionIds = sessions.map((s) => s.id);
    }

    const counts = await this.prisma.message.groupBy({
      by: ['tripId'],
      where: {
        trip: { companyId },
        isRead: false,
        senderId: { not: requesterId },
        ...(visibleSessionIds ? { sessionId: { in: visibleSessionIds } } : {}),
      },
      _count: { _all: true },
    });
    if (counts.length === 0) return { total: 0, items: [] };

    const tripIds = counts.map((c) => c.tripId);

    const trips = await this.prisma.trip.findMany({
      where: { id: { in: tripIds } },
      select: {
        id: true,
        status: true,
        truckId: true,
        truck: { select: { plate: true } },
      },
    });
    const tripById = new Map(trips.map((t) => [t.id, t]));

    type TruckEntry = {
      plate: string;
      activeTripUnread: number;
      pastTripsUnread: number;
      tripUnread: Record<string, number>;
    };
    const truckMap = new Map<string, TruckEntry>();
    for (const c of counts) {
      const trip = tripById.get(c.tripId);
      if (!trip) continue;
      const isActive = (ACTIVE_TRIP_STATUSES as readonly string[]).includes(
        trip.status,
      );
      let entry = truckMap.get(trip.truckId);
      if (!entry) {
        entry = {
          plate: trip.truck.plate,
          activeTripUnread: 0,
          pastTripsUnread: 0,
          tripUnread: {},
        };
        truckMap.set(trip.truckId, entry);
      }
      const cnt = c._count._all;
      if (isActive) entry.activeTripUnread += cnt;
      else entry.pastTripsUnread += cnt;
      entry.tripUnread[c.tripId] = cnt;
    }

    const truckIds = [...truckMap.keys()];
    if (truckIds.length === 0) return { total: 0, items: [] };

    const sessionClause = visibleSessionIds
      ? Prisma.sql`AND m."sessionId" IN (${Prisma.join(visibleSessionIds)})`
      : Prisma.empty;

    const latestIds = await this.prisma.$queryRaw<Array<{ id: string }>>(
      Prisma.sql`
        WITH ranked AS (
          SELECT m.id,
                 ROW_NUMBER() OVER (
                   PARTITION BY t."truckId" ORDER BY m."createdAt" DESC
                 ) AS rn
          FROM "Message" m
          JOIN "Trip" t ON t.id = m."tripId"
          WHERE m."isRead" = false
            AND m."senderId" != ${requesterId}
            AND t."companyId" = ${companyId}
            AND t."truckId" IN (${Prisma.join(truckIds)})
            ${sessionClause}
        )
        SELECT id FROM ranked WHERE rn = 1
      `,
    );

    const latestMessages = await this.prisma.message.findMany({
      where: { id: { in: latestIds.map((r) => r.id) } },
      select: {
        id: true,
        content: true,
        createdAt: true,
        tripId: true,
        sender: { select: { firstName: true, lastName: true, avatar: true } },
      },
    });
    const latestByTruck = new Map<string, (typeof latestMessages)[number]>();
    for (const m of latestMessages) {
      const trip = tripById.get(m.tripId);
      if (trip) latestByTruck.set(trip.truckId, m);
    }

    const items = [...truckMap.entries()]
      .map(([truckId, data]) => {
        const latest = latestByTruck.get(truckId);
        const latestMessage = latest
          ? {
              content: latest.content,
              senderName: fullName(latest.sender) || 'Driver',
              tripId: latest.tripId,
              isActiveTrip: (ACTIVE_TRIP_STATUSES as readonly string[]).includes(
                tripById.get(latest.tripId)!.status,
              ),
              createdAt: latest.createdAt.toISOString(),
            }
          : null;
        return {
          truckId,
          plate: data.plate,
          totalUnread: data.activeTripUnread + data.pastTripsUnread,
          activeTripUnread: data.activeTripUnread,
          pastTripsUnread: data.pastTripsUnread,
          tripUnread: data.tripUnread,
          latestMessage,
        };
      })
      .sort((a, b) => b.totalUnread - a.totalUnread);

    return {
      total: items.reduce((s, i) => s + i.totalUnread, 0),
      items,
    };
  }

  // Unread summary for the driver — only their own trips, only messages
  // from others (managers / admin). Filters to sessions they participated
  // in (covers the manager-handover case).
  //
  // 4 fixed-cost queries instead of one huge findMany with includes:
  //  1. sessions where the driver participated
  //  2. groupBy { tripId, _count } for unread counts
  //  3. trip metadata (status, title)
  //  4. raw SQL ROW_NUMBER() → latest unread id per trip + a findMany to
  //     hydrate sender info
  async getDriverUnreadSummary(driverId: string) {
    const empty = {
      total: 0,
      activeTripUnread: 0,
      pastTripsUnread: 0,
      tripUnread: {} as Record<string, number>,
      items: [] as Array<{
        tripId: string;
        unread: number;
        isActiveTrip: boolean;
        tripTitle: string;
        latestMessage:
          | { content: string; senderName: string; createdAt: string }
          | null;
      }>,
    };

    const sessions = await this.prisma.tripChatSession.findMany({
      where: { driverId },
      select: { id: true },
    });
    if (sessions.length === 0) return empty;
    const sessionIds = sessions.map((s) => s.id);

    const counts = await this.prisma.message.groupBy({
      by: ['tripId'],
      where: {
        trip: { driverId },
        isRead: false,
        senderId: { not: driverId },
        sessionId: { in: sessionIds },
      },
      _count: { _all: true },
    });
    if (counts.length === 0) return empty;
    const tripIds = counts.map((c) => c.tripId);

    const trips = await this.prisma.trip.findMany({
      where: { id: { in: tripIds } },
      select: { id: true, status: true, title: true },
    });
    const tripById = new Map(trips.map((t) => [t.id, t]));

    const latestIds = await this.prisma.$queryRaw<Array<{ id: string }>>(
      Prisma.sql`
        WITH ranked AS (
          SELECT m.id,
                 ROW_NUMBER() OVER (
                   PARTITION BY m."tripId" ORDER BY m."createdAt" DESC
                 ) AS rn
          FROM "Message" m
          WHERE m."isRead" = false
            AND m."senderId" != ${driverId}
            AND m."tripId" IN (${Prisma.join(tripIds)})
            AND m."sessionId" IN (${Prisma.join(sessionIds)})
        )
        SELECT id FROM ranked WHERE rn = 1
      `,
    );

    const latestMessages = await this.prisma.message.findMany({
      where: { id: { in: latestIds.map((r) => r.id) } },
      select: {
        id: true,
        content: true,
        createdAt: true,
        tripId: true,
        sender: { select: { firstName: true, lastName: true, avatar: true } },
      },
    });
    const latestByTrip = new Map(latestMessages.map((m) => [m.tripId, m]));

    let activeTripUnread = 0;
    let pastTripsUnread = 0;
    const tripUnread: Record<string, number> = {};

    const items = counts
      .map((c) => {
        const trip = tripById.get(c.tripId);
        if (!trip) return null;
        const isActive = (ACTIVE_TRIP_STATUSES as readonly string[]).includes(
          trip.status,
        );
        const cnt = c._count._all;
        if (isActive) activeTripUnread += cnt;
        else pastTripsUnread += cnt;
        tripUnread[c.tripId] = cnt;
        const latest = latestByTrip.get(c.tripId);
        return {
          tripId: c.tripId,
          unread: cnt,
          isActiveTrip: isActive,
          tripTitle: trip.title,
          latestMessage: latest
            ? {
                content: latest.content,
                senderName: fullName(latest.sender) || 'Manager',
                createdAt: latest.createdAt.toISOString(),
              }
            : null,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    return {
      total: activeTripUnread + pastTripsUnread,
      activeTripUnread,
      pastTripsUnread,
      tripUnread,
      items,
    };
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
