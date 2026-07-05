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

    // Translation is intentionally stubbed for now — the feature isn't wired
    // up end-to-end yet and the Google Translate API call was blocking the
    // send-path with ~200-800ms of round-trip per message. When translation
    // comes back, do it AFTER persist + emit (so the sender isn't blocked)
    // and broadcast a separate `messageTranslated` patch event.
    const translatedContent: string | null = null;

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
        // Gateway uses trip.truckId to route the lightweight
        // tripUnreadChanged signal to the truck-watchers room (Phase 2
        // fan-out reduction) without an extra DB round-trip.
        trip: { select: { truckId: true } },
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

  // Unread summary for the manager — one SQL round-trip. CTEs:
  //   unread      → in-scope unread messages flagged active/past
  //   trip_counts → per-trip count + truckId + is_active flag
  //   truck_totals→ per-truck aggregates + jsonb_object_agg for tripUnread
  //   ranked/latest → latest unread message per truck (window function)
  // json_build_object hydrates the snippet inline so JS just renames keys.
  async getUnreadSummary(
    companyId: string,
    requesterId: string,
    requesterRole: string,
  ) {
    // Unread badges are for the LIVE chat only — mirrors
    // TripChatSessionsService.getVisibleSessionIds:
    //  - ADMIN: no filter (sees the whole company).
    //  - Anyone else: unread only from trips where they are the CURRENT
    //    participant. Replaced managers/drivers and team leads get no
    //    badges here — those chats are reachable via the archive.
    const sessionFilter =
      requesterRole === 'ADMIN'
        ? Prisma.empty
        : Prisma.sql`AND (t."driverId" = ${requesterId} OR t."managerId" = ${requesterId})
            AND m."sessionId" IN (
              SELECT id FROM "TripChatSession"
              WHERE "driverId" = ${requesterId} OR "managerId" = ${requesterId}
            )`;

    type Row = {
      truckId: string;
      plate: string;
      total_unread: number;
      active_trip_unread: number;
      past_trips_unread: number;
      trip_unread: Record<string, number>;
      latest_message: {
        content: string;
        senderName: string;
        tripId: string;
        isActiveTrip: boolean;
        createdAt: string;
      } | null;
    };

    const rows = await this.prisma.$queryRaw<Row[]>(Prisma.sql`
      WITH unread AS (
        SELECT m.id, m."tripId", m."senderId", m.content, m."createdAt",
               t."truckId",
               (t.status IN ('ASSIGNED','ACCEPTED','ON_WAY','ON_SITE','LOADED'))
                 AS is_active
        FROM "Message" m
        JOIN "Trip" t ON t.id = m."tripId"
        WHERE m."isRead" = false
          AND m."senderId" != ${requesterId}
          AND t."companyId" = ${companyId}
          ${sessionFilter}
      ),
      trip_counts AS (
        SELECT "tripId", "truckId", is_active, COUNT(*)::int AS cnt
        FROM unread
        GROUP BY "tripId", "truckId", is_active
      ),
      truck_totals AS (
        SELECT "truckId",
               SUM(cnt)::int AS total_unread,
               SUM(CASE WHEN is_active THEN cnt ELSE 0 END)::int AS active_trip_unread,
               SUM(CASE WHEN is_active THEN 0 ELSE cnt END)::int AS past_trips_unread,
               jsonb_object_agg("tripId"::text, cnt) AS trip_unread
        FROM trip_counts
        GROUP BY "truckId"
      ),
      ranked AS (
        SELECT *, ROW_NUMBER() OVER (
          PARTITION BY "truckId" ORDER BY "createdAt" DESC
        ) AS rn
        FROM unread
      ),
      latest AS (SELECT * FROM ranked WHERE rn = 1)
      SELECT
        tt."truckId",
        tr.plate,
        tt.total_unread,
        tt.active_trip_unread,
        tt.past_trips_unread,
        tt.trip_unread,
        CASE WHEN l.id IS NULL THEN NULL ELSE
          json_build_object(
            'content', l.content,
            'senderName', TRIM(CONCAT_WS(' ', s."firstName", s."lastName")),
            'tripId', l."tripId",
            'isActiveTrip', l.is_active,
            'createdAt', l."createdAt"
          )
        END AS latest_message
      FROM truck_totals tt
      JOIN "Truck" tr ON tr.id = tt."truckId"
      LEFT JOIN latest l ON l."truckId" = tt."truckId"
      LEFT JOIN "User" s ON s.id = l."senderId"
      ORDER BY tt.total_unread DESC
    `);

    // Apply the "Driver" fallback for empty senderName (matches the old
    // fullName(...) || 'Driver' behaviour).
    const items = rows.map((r) => {
      let latestMessage = r.latest_message;
      if (latestMessage && !latestMessage.senderName) {
        latestMessage = { ...latestMessage, senderName: 'Driver' };
      }
      return {
        truckId: r.truckId,
        plate: r.plate,
        totalUnread: r.total_unread,
        activeTripUnread: r.active_trip_unread,
        pastTripsUnread: r.past_trips_unread,
        tripUnread: r.trip_unread,
        latestMessage,
      };
    });

    return {
      total: items.reduce((s, i) => s + i.totalUnread, 0),
      items,
    };
  }

  // Unread summary for the driver — one SQL round-trip. CTEs:
  //   unread      → in-scope unread messages (driver's trips, sessions
  //                 they participated in) flagged active/past
  //   trip_counts → per-trip aggregates
  //   ranked/latest → latest unread message per trip (window function)
  // json_build_object hydrates the snippet inline.
  async getDriverUnreadSummary(driverId: string) {
    type Row = {
      tripId: string;
      unread: number;
      is_active: boolean;
      trip_title: string;
      latest_message: {
        content: string;
        senderName: string;
        createdAt: string;
      } | null;
    };

    const rows = await this.prisma.$queryRaw<Row[]>(Prisma.sql`
      WITH unread AS (
        SELECT m.id, m."tripId", m."senderId", m.content, m."createdAt",
               t.title AS trip_title,
               (t.status IN ('ASSIGNED','ACCEPTED','ON_WAY','ON_SITE','LOADED'))
                 AS is_active
        FROM "Message" m
        JOIN "Trip" t ON t.id = m."tripId"
        WHERE m."isRead" = false
          AND m."senderId" != ${driverId}
          AND t."driverId" = ${driverId}
          AND m."sessionId" IN (
            SELECT id FROM "TripChatSession" WHERE "driverId" = ${driverId}
          )
      ),
      trip_counts AS (
        SELECT "tripId", trip_title, is_active, COUNT(*)::int AS unread
        FROM unread
        GROUP BY "tripId", trip_title, is_active
      ),
      ranked AS (
        SELECT *, ROW_NUMBER() OVER (
          PARTITION BY "tripId" ORDER BY "createdAt" DESC
        ) AS rn
        FROM unread
      ),
      latest AS (SELECT * FROM ranked WHERE rn = 1)
      SELECT
        tc."tripId",
        tc.unread,
        tc.is_active,
        tc.trip_title,
        CASE WHEN l.id IS NULL THEN NULL ELSE
          json_build_object(
            'content', l.content,
            'senderName', TRIM(CONCAT_WS(' ', s."firstName", s."lastName")),
            'createdAt', l."createdAt"
          )
        END AS latest_message
      FROM trip_counts tc
      LEFT JOIN latest l ON l."tripId" = tc."tripId"
      LEFT JOIN "User" s ON s.id = l."senderId"
      ORDER BY l."createdAt" DESC NULLS LAST
    `);

    let activeTripUnread = 0;
    let pastTripsUnread = 0;
    const tripUnread: Record<string, number> = {};

    const items = rows.map((r) => {
      if (r.is_active) activeTripUnread += r.unread;
      else pastTripsUnread += r.unread;
      tripUnread[r.tripId] = r.unread;
      let latestMessage = r.latest_message;
      if (latestMessage && !latestMessage.senderName) {
        latestMessage = { ...latestMessage, senderName: 'Manager' };
      }
      return {
        tripId: r.tripId,
        unread: r.unread,
        isActiveTrip: r.is_active,
        tripTitle: r.trip_title,
        latestMessage,
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

  // Mark every unread message AND document in a trip *not authored/uploaded
  // by* `readerId` as read. Returns the IDs that were just flipped, so the
  // gateway can emit a precise event to the senders rather than refetching
  // the whole history.
  //
  // Was: findMany + updateMany per resource (4 round-trips total).
  // Now: UPDATE ... RETURNING id (the IDs come back from the same query),
  // and both resources flipped in parallel — 2 round-trips wall time
  // instead of 4.
  async markTripRead(
    tripId: string,
    readerId: string,
    readerRole: string,
  ): Promise<{ messageIds: string[]; documentIds: string[] }> {
    const sessionIds = await this.sessions.getVisibleSessionIds(tripId, {
      id: readerId,
      role: readerRole,
    });

    const messagesPromise: Promise<Array<{ id: string }>> =
      sessionIds.length === 0
        ? Promise.resolve([])
        : this.prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
            UPDATE "Message"
            SET "isRead" = true
            WHERE "sessionId" IN (${Prisma.join(sessionIds)})
              AND "isRead" = false
              AND "senderId" != ${readerId}
            RETURNING id
          `);

    const documentsPromise = this.prisma.$queryRaw<Array<{ id: string }>>(
      Prisma.sql`
        UPDATE "TripDocument"
        SET "isRead" = true
        WHERE "tripId" = ${tripId}
          AND "isRead" = false
          AND "uploadedBy" != ${readerId}
        RETURNING id
      `,
    );

    const [updatedMessages, updatedDocs] = await Promise.all([
      messagesPromise,
      documentsPromise,
    ]);

    return {
      messageIds: updatedMessages.map((r) => r.id),
      documentIds: updatedDocs.map((r) => r.id),
    };
  }
}
