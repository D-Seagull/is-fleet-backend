import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateTripDto } from './dto/create-trip.dto';
import { UpdateTripDto } from './dto/update-trip.dto';
import { MessagesGateway } from '../messages/messages.gateway';
import { TripChatSessionsService } from '../messages/trip-chat-sessions.service';
import { PushService } from '../push/push.service';
import { ReactionsService } from '../reactions/reactions.service';
import { fullName } from '../common/utils/full-name';
import { t } from '../i18n/i18n';

const tripInclude = {
  driver: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      avatar: true,
      status: true,
      statusUntil: true,
      phone: true,
    },
  },
  // managerId is here so clients can tell who may delete the trip without a
  // second request — the rule is the truck's current manager, or a teamlead.
  truck: { select: { id: true, plate: true, managerId: true } },
  manager: {
    select: { id: true, firstName: true, lastName: true, avatar: true },
  },
  stops: { orderBy: { order: 'asc' as const } },
  documents: true,
};

const ACTIVE_STATUSES = [
  'ASSIGNED',
  'ACCEPTED',
  'ON_WAY',
  'ON_SITE',
  'LOADED',
] as const;

@Injectable()
export class TripsService {
  constructor(
    private prisma: PrismaService,
    private gateway: MessagesGateway,
    private sessions: TripChatSessionsService,
    private push: PushService,
    private reactions: ReactionsService,
  ) {}

  /**
   * Notify everyone who needs to re-fetch a trip after it changes: its chat
   * room, the company room (web managers' lists), and the driver's personal
   * room — the last is what makes the mobile Trips list / active-trip refresh
   * live without a reload.
   */
  private emitTripUpdated(
    tripId: string,
    companyId?: string | null,
    driverId?: string | null,
  ) {
    this.gateway.server.to(tripId).emit('tripUpdated', { tripId });
    if (companyId) {
      this.gateway.server
        .to(`company-${companyId}`)
        .emit('tripUpdated', { tripId });
    }
    if (driverId) {
      this.gateway.server.to(driverId).emit('tripUpdated', { tripId });
    }
  }

  async create(companyId: string, managerId: string, dto: CreateTripDto) {
    const trip = await this.prisma.trip.create({
      data: {
        title: dto.title,
        managerId,
        driverId: dto.driverId,
        truckId: dto.truckId,
        companyId,
        notes: dto.notes,
        orderNumber: dto.orderNumber,
        stops: dto.stops?.length
          ? {
              create: dto.stops.map((s, i) => ({
                type: s.type,
                order: s.order ?? i,
                name: s.name,
                address: s.address,
                ref: s.ref,
                coords: s.coords,
                windowDate: s.windowDate,
                windowStart: s.windowStart,
                windowEnd: s.windowEnd,
              })),
            }
          : undefined,
      },
      include: tripInclude,
    });
    await this.sessions.openInitial(trip.id, trip.driverId, trip.managerId);

    // Push: notify the assigned driver about the new trip — body shows the
    // first loading address so they can act without opening the app. The
    // mobile app turns "OK" on NEW_TRIP into a status → ACCEPTED transition.
    const loadingStop = trip.stops.find((s) => s.type === 'LOADING');
    const address = loadingStop?.address?.trim();
    await this.push.sendLocalizedToUsers(
      [trip.driverId],
      (lang) => ({
        title: t(lang, 'push.newLoading'),
        body: address ? address : trip.title,
      }),
      {
        data: {
          type: 'NEW_TRIP',
          tripId: trip.id,
          truckId: trip.truckId,
        },
      },
    );

    // Live-refresh the assigned driver's Trips list / active trip.
    this.emitTripUpdated(trip.id, companyId, trip.driverId);

    return trip;
  }

  async findAll(companyId: string) {
    return this.prisma.trip.findMany({
      where: { companyId, deletedAt: null },
      include: tripInclude,
      orderBy: { createdAt: 'desc' },
    });
  }

  // trips for a specific truck (Chat + Trips tabs)
  async findByTruck(truckId: string, companyId: string) {
    return this.prisma.trip.findMany({
      where: { truckId, companyId, deletedAt: null },
      include: tripInclude,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, companyId: string) {
    const trip = await this.prisma.trip.findFirst({
      where: { id, companyId, deletedAt: null },
      include: tripInclude,
    });
    if (!trip) throw new NotFoundException('errors.tripNotFound');
    return trip;
  }

  // Driver's own trips — used by the driver mobile app.
  async findMyTrips(driverId: string) {
    return this.prisma.trip.findMany({
      where: { driverId, deletedAt: null },
      include: tripInclude,
      orderBy: { createdAt: 'desc' },
    });
  }

  // Currently active trip for the driver (any non-DELIVERED status).
  // Перевіряємо також що трак ЗАРАЗ належить цьому водію —
  // щоб не повернути старий тріп після переводу водія на інший трак.
  async findMyActiveTrip(driverId: string) {
    const candidates = await this.prisma.trip.findMany({
      where: {
        driverId,
        deletedAt: null,
        status: { in: [...ACTIVE_STATUSES] },
        truck: { currentDriverId: driverId },
      },
      include: tripInclude,
    });
    if (candidates.length === 0) return null;
    // A trip that's actually in progress must win over one merely just
    // assigned — otherwise a freshly ASSIGNED trip (newest createdAt) would
    // hide the ON_WAY one the driver is really doing. Rank by status
    // progression first, then most recent within the same tier.
    const rank: Record<string, number> = {
      LOADED: 5,
      ON_SITE: 4,
      ON_WAY: 3,
      ACCEPTED: 2,
      ASSIGNED: 1,
    };
    candidates.sort((a, b) => {
      const byStatus = (rank[b.status] ?? 0) - (rank[a.status] ?? 0);
      if (byStatus !== 0) return byStatus;
      return b.createdAt.getTime() - a.createdAt.getTime();
    });
    return candidates[0];
  }

  // load message history for a trip.
  // Privacy: requester sees only sessions they participated in (or all if
  // they're a manager). Drivers retained across a manager swap see both
  // their old and new chats as one continuous stream.
  //
  // Pagination: fetches the latest `take` messages older than `before`
  // (or the latest overall if no cursor). Result is returned in ASC order
  // so clients can append it to existing history without reversing.
  async getMessages(
    tripId: string,
    companyId: string,
    requester: { id: string; role: string },
    opts: { take?: number; before?: Date } = {},
  ) {
    const trip = await this.prisma.trip.findFirst({
      where: { id: tripId, companyId, deletedAt: null },
    });
    if (!trip) throw new NotFoundException('errors.tripNotFound');

    const sessionIds = await this.sessions.getVisibleSessionIds(
      tripId,
      requester,
    );
    if (sessionIds.length === 0) return [];

    const take = opts.take ?? 50;
    const beforeClause = opts.before
      ? Prisma.sql`AND "createdAt" < ${opts.before}`
      : Prisma.empty;

    // Run the messages query and the reactions subquery in parallel so total
    // wall time is max(t1, t2) instead of t1 + t2. The reactions subquery
    // narrows to the same page-window as the main query via an IN clause,
    // so it returns exactly the rows we need to attach.
    const [rows, reactionRows] = await Promise.all([
      this.prisma.message.findMany({
        where: {
          sessionId: { in: sessionIds },
          ...(opts.before ? { createdAt: { lt: opts.before } } : {}),
        },
        include: {
          sender: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              avatar: true,
              status: true,
              statusUntil: true,
              role: true,
            },
          },
          replyTo: {
            select: {
              id: true,
              content: true,
              deletedAt: true,
              sender: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  avatar: true,
                },
              },
            },
          },
          replyToDocument: {
            select: {
              id: true,
              fileName: true,
              fileType: true,
              deletedAt: true,
              uploader: {
                select: { id: true, firstName: true, lastName: true, avatar: true },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take,
      }),
      this.prisma.$queryRaw<
        Array<{ id: string; targetId: string; userId: string; emoji: string }>
      >(Prisma.sql`
        SELECT id, "targetId", "userId", emoji
        FROM "MessageReaction"
        WHERE "targetType" = 'TRIP'
          AND "targetId" IN (
            SELECT id FROM "Message"
            WHERE "sessionId" IN (${Prisma.join(sessionIds)})
              ${beforeClause}
            ORDER BY "createdAt" DESC
            LIMIT ${take}
          )
      `),
    ]);

    const reactionsByMsg = new Map<
      string,
      Array<{ id: string; userId: string; emoji: string }>
    >();
    for (const r of reactionRows) {
      let arr = reactionsByMsg.get(r.targetId);
      if (!arr) {
        arr = [];
        reactionsByMsg.set(r.targetId, arr);
      }
      arr.push({ id: r.id, userId: r.userId, emoji: r.emoji });
    }

    // Latest N fetched DESC; flip to ASC so the chat renders oldest-first.
    const messages = rows.reverse();
    return messages.map((m) => ({
      ...m,
      reactions: reactionsByMsg.get(m.id) ?? [],
    }));
  }

  async updateStatus(id: string, companyId: string, dto: UpdateTripDto) {
    await this.findOne(id, companyId);
    const updated = await this.prisma.trip.update({
      where: { id },
      data: { status: dto.status },
    });
    this.emitTripUpdated(id, companyId, updated.driverId);
    return updated;
  }

  // update trip info (notes + stops) — replaces all stops
  async updateInfo(id: string, companyId: string, dto: UpdateTripDto) {
    const existing = await this.findOne(id, companyId);

    if (dto.stops !== undefined) {
      // delete all existing stops then recreate
      await this.prisma.tripStop.deleteMany({ where: { tripId: id } });
      if (dto.stops.length > 0) {
        await this.prisma.tripStop.createMany({
          data: dto.stops.map((s, i) => ({
            tripId: id,
            type: s.type,
            order: s.order ?? i,
            name: s.name,
            address: s.address,
            ref: s.ref,
            coords: s.coords,
            windowDate: s.windowDate,
            windowStart: s.windowStart,
            windowEnd: s.windowEnd,
          })),
        });
      }
    }

    const updated = await this.prisma.trip.update({
      where: { id },
      data: {
        notes: dto.notes,
        orderNumber: dto.orderNumber,
        // назва рейсу перераховується клієнтом з адрес; оновлюємо лише коли передана
        ...(dto.title !== undefined ? { title: dto.title } : {}),
      },
      include: tripInclude,
    });
    this.emitTripUpdated(id, companyId, existing.driverId);
    return updated;
  }

  /** Reassign a trip to a different driver (manager action).
   *  Якщо водій змінюється — закриваємо поточну чат-сесію і відкриваємо нову,
   *  щоб новий водій бачив чистий чат. Стара переписка зберігається в архіві. */
  async assignDriver(
    id: string,
    companyId: string,
    driverId: string,
    triggeredById: string,
  ) {
    const trip = await this.prisma.trip.findFirst({
      where: { id, companyId, deletedAt: null },
    });
    if (!trip) throw new NotFoundException('errors.tripNotFound');

    const driverChanged = trip.driverId !== driverId;

    const updated = await this.prisma.trip.update({
      where: { id },
      data: { driverId },
      include: tripInclude,
    });

    if (driverChanged) {
      const { systemMessage } = await this.sessions.closeAndOpenNew(
        id,
        'DRIVER_CHANGED',
        driverId,
        trip.managerId,
        triggeredById,
      );
      this.emitTripUpdated(id, trip.companyId, driverId);
      if (systemMessage) {
        this.gateway.server.to(id).emit('newMessage', systemMessage);
        if (trip.companyId) {
          this.gateway.server
            .to(`company-${trip.companyId}`)
            .emit('newMessage', systemMessage);
        }
        // Refresh the bell/badges of the trip's participants — the driver-change
        // system message is a fresh unread (skip whoever triggered it).
        const signal = { tripId: id, truckId: updated.truckId };
        if (driverId !== triggeredById) {
          this.gateway.server.to(driverId).emit('tripUnreadChanged', signal);
        }
        if (trip.managerId && trip.managerId !== triggeredById) {
          this.gateway.server.to(trip.managerId).emit('tripUnreadChanged', signal);
        }
        if (trip.companyId) {
          this.gateway.server
            .to(`company-admin-${trip.companyId}`)
            .emit('tripUnreadChanged', signal);
        }
      }
    }

    return updated;
  }

  /** Reassign an existing trip to a different manager. */
  async assignManager(
    id: string,
    companyId: string,
    managerId: string,
    triggeredById: string,
  ) {
    const trip = await this.prisma.trip.findFirst({
      where: { id, companyId, deletedAt: null },
    });
    if (!trip) throw new NotFoundException('errors.tripNotFound');

    const managerChanged = trip.managerId !== managerId;

    const updated = await this.prisma.trip.update({
      where: { id },
      data: { managerId },
      include: tripInclude,
    });

    if (managerChanged) {
      const { systemMessage } = await this.sessions.closeAndOpenNew(
        id,
        'MANAGER_CHANGED',
        trip.driverId,
        managerId,
        triggeredById,
      );
      this.emitTripUpdated(id, trip.companyId, trip.driverId);
      if (systemMessage) {
        this.gateway.server.to(id).emit('newMessage', systemMessage);
        if (trip.companyId) {
          this.gateway.server
            .to(`company-${trip.companyId}`)
            .emit('newMessage', systemMessage);
        }
      }

      // Invalidate the unread badge for the driver + new manager in real time
      // — the manager-change system message is a fresh unread for them, so we
      // mirror the normal-message fan-out (which the badge relies on). Without
      // this the driver's bell only caught up on the next 20s poll, so it
      // looked like reading the chat didn't reset it. Skip whoever triggered
      // the change (no unread for self); ADMIN/TEAMLEAD get it via their room.
      const unreadSignal = { tripId: id };
      if (trip.driverId && trip.driverId !== triggeredById) {
        this.gateway.server
          .to(trip.driverId)
          .emit('tripUnreadChanged', unreadSignal);
      }
      if (managerId !== triggeredById) {
        this.gateway.server
          .to(managerId)
          .emit('tripUnreadChanged', unreadSignal);
      }
      if (trip.companyId) {
        this.gateway.server
          .to(`company-admin-${trip.companyId}`)
          .emit('tripUnreadChanged', unreadSignal);
      }

      // Push to the new manager (they now own this trip) and to the driver
      // (their counterpart changed). The in-chat system message is great
      // when the user has the chat open; a push is what gets attention when
      // they don't. Don't notify the previous manager — they lost access
      // and pinging them would be noise.
      const [newManager] = await Promise.all([
        this.prisma.user.findUnique({
          where: { id: managerId },
          select: { firstName: true, lastName: true, avatar: true },
        }),
        this.push.sendLocalizedToUsers(
          [managerId],
          (lang) => ({
            title: t(lang, 'push.tripAssigned'),
            body: updated.title,
          }),
          {
            data: {
              type: 'MANAGER_ASSIGNED_TRIP',
              tripId: id,
              truckId: updated.truckId,
            },
          },
        ),
      ]);

      if (trip.driverId) {
        await this.push.sendLocalizedToUsers(
          [trip.driverId],
          (lang) => ({
            title: t(lang, 'push.managerChanged'),
            body: t(lang, 'push.newManager', {
              name: fullName(newManager) || t(lang, 'push.noName'),
            }),
          }),
          {
            data: {
              type: 'MANAGER_CHANGED',
              tripId: id,
              managerId,
            },
          },
        );
      }

      // Keep team leads in the loop on the change (info, third person).
      const excludeIds = [managerId, trip.managerId].filter(
        (x): x is string => !!x,
      );
      const teamleads = await this.prisma.user.findMany({
        where: { companyId, role: 'TEAMLEAD', id: { notIn: excludeIds } },
        select: { id: true },
      });
      if (teamleads.length > 0) {
        await this.push.sendLocalizedToUsers(
          teamleads.map((u) => u.id),
          (lang) => ({
            title: t(lang, 'push.managerInfoTitle'),
            body: t(lang, 'push.managerAssignedTripInfo', {
              title: updated.title,
              name: fullName(newManager) || t(lang, 'push.noName'),
            }),
          }),
          { data: { type: 'MANAGER_ASSIGNED_TRIP', tripId: id, truckId: updated.truckId } },
        );
      }

      // The previous manager lost this trip — tell them, and who took over.
      if (trip.managerId && trip.managerId !== managerId) {
        await this.push.sendLocalizedToUsers(
          [trip.managerId],
          (lang) => ({
            title: t(lang, 'push.tripUnassignedTitle', { title: updated.title }),
            body: t(lang, 'push.unassignedNewManager', {
              manager: fullName(newManager) || t(lang, 'push.noName'),
            }),
          }),
          { data: { type: 'MANAGER_REMOVED_TRIP', tripId: id, truckId: updated.truckId } },
        );
      }
    }

    return updated;
  }

  // Read-side wrappers around TripChatSessionsService — let the controller
  // depend only on TripsService, keeping module dependencies symmetric.
  async getChatArchive(
    tripId: string,
    companyId: string,
    requester: { id: string; role: string },
  ) {
    await this.findOne(tripId, companyId);
    return this.sessions.findArchived(tripId, requester);
  }

  async getSessionMessages(
    sessionId: string,
    requester: { id: string; role: string },
  ) {
    return this.sessions.findMessagesBySession(sessionId, requester);
  }

  async driverUpdateStatus(id: string, driverId: string, dto: UpdateTripDto) {
    const trip = await this.prisma.trip.findFirst({
      where: { id, driverId, deletedAt: null },
    });
    if (!trip) throw new ForbiddenException('errors.noAccessTrip');
    const updated = await this.prisma.trip.update({
      where: { id },
      data: { status: dto.status },
      include: { truck: { select: { plate: true } } },
    });
    // Driver changed it themselves (their app updates optimistically); push
    // to the company room + trip room so web managers see it live.
    this.emitTripUpdated(id, trip.companyId, null);

    // Push the trip's manager so they learn the driver advanced the trip even
    // when the app is closed. Body reads e.g. "AB1234: On Way".
    if (trip.managerId && dto.status) {
      const status = dto.status;
      const plate = updated.truck?.plate ?? '';
      void this.push.sendLocalizedToUsers(
        [trip.managerId],
        (lang) => ({
          title: t(lang, 'push.tripStatusTitle'),
          body: t(lang, 'push.tripStatusBody', {
            plate,
            status: t(lang, `tripStatus.${status}`),
          }),
        }),
        { data: { type: 'TRIP_STATUS', tripId: id, truckId: trip.truckId } },
      );
    }
    return updated;
  }

  /**
   * Hides a trip from everyone. The row stays: a trip carries the transport
   * record — its messages, documents and chat history — which the privacy
   * policy promises to keep for the employing company, and which account
   * deletion deliberately anonymises rather than destroys.
   *
   * Every read filters on `deletedAt: null`, so hidden trips vanish from
   * lists, chat, alarms and admin counts alike. The UI still says "delete":
   * that is what the user means, and keeping the row is our business.
   *
   * Reversible by clearing the column — which matters, because this is now
   * reachable from a long-press on a phone.
   *
   * Only the manager currently assigned to the *truck* may delete its trips;
   * teamleads and admins may delete any. Enforced here rather than in the
   * controller because the UI is not the only caller — a plain DELETE would
   * otherwise walk straight past the rule the buttons imply.
   *
   * Note the check is on the truck's manager, not the trip's: a trip keeps
   * the manager who created it, while responsibility follows whoever holds
   * the truck now.
   */
  async remove(
    id: string,
    companyId: string,
    actor: { id: string; role: string },
  ) {
    const trip = await this.findOne(id, companyId);

    if (actor.role === 'MANAGER') {
      const truck = await this.prisma.truck.findUnique({
        where: { id: trip.truckId },
        select: { managerId: true },
      });
      if (truck?.managerId !== actor.id) {
        throw new ForbiddenException('errors.cannotDeleteTrip');
      }
    }

    await this.prisma.trip.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    return { message: `Trip ${trip.title} deleted!` };
  }

  async broadcastToMyTrucks(
    userId: string,
    companyId: string,
    content: string,
  ) {
    const trips = await this.prisma.trip.findMany({
      where: {
        companyId,
        deletedAt: null,
        status: { in: [...ACTIVE_STATUSES] },
        truck: { managerId: userId },
      },
    });

    const results = await Promise.all(
      trips.map(async (trip) => {
        const session = await this.sessions.getActiveSession(trip.id);
        if (!session) return null;
        const message = await this.prisma.message.create({
          data: {
            tripId: trip.id,
            sessionId: session.id,
            senderId: userId,
            content,
          },
          include: {
            sender: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                avatar: true,
                status: true,
                statusUntil: true,
                role: true,
              },
            },
            // Driver's realtime handler drops any message whose `session`
            // doesn't include them — so the broadcast payload MUST carry it,
            // otherwise it only appears after a reload.
            session: { select: { driverId: true, managerId: true } },
          },
        });
        this.gateway.server.to(trip.id).emit('newMessage', message);
        // Fan out the lightweight unread signal to the driver's personal room
        // so their bell / trip list updates live even when the chat isn't open
        // (mirrors the normal send path in MessagesGateway). Without this a
        // broadcast only showed up after an app reload.
        if (trip.driverId && trip.driverId !== userId) {
          this.gateway.server
            .to(trip.driverId)
            .emit('tripUnreadChanged', { tripId: trip.id });
        }

        // Push only when the driver is not online (socket would otherwise
        // already deliver the message in real time).
        if (trip.driverId && trip.driverId !== userId) {
          void (async () => {
            const online = await this.gateway.isUserOnline(trip.driverId);
            if (online) return;
            const senderName = fullName(message.sender);
            await this.push.sendLocalizedToUsers(
              [trip.driverId],
              (lang) => ({
                title: senderName || t(lang, 'push.newMessage'),
                body: content.slice(0, 200),
              }),
              {
                data: {
                  type: 'MESSAGE',
                  tripId: trip.id,
                  messageId: message.id,
                },
              },
            );
          })();
        }
        return message;
      }),
    );

    return { sent: results.filter(Boolean).length };
  }
}
