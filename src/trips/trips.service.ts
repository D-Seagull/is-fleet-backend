import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateTripDto } from './dto/create-trip.dto';
import { UpdateTripDto } from './dto/update-trip.dto';
import { MessagesGateway } from '../messages/messages.gateway';
import { TripChatSessionsService } from '../messages/trip-chat-sessions.service';

const tripInclude = {
  driver: { select: { id: true, name: true, phone: true } },
  truck: { select: { id: true, plate: true } },
  dispatcher: { select: { id: true, name: true } },
  stops: { orderBy: { order: 'asc' as const } },
  documents: true,
};

const ACTIVE_STATUSES = ['ASSIGNED', 'ACCEPTED', 'ON_WAY', 'ON_SITE', 'LOADED'] as const;

@Injectable()
export class TripsService {
  constructor(
    private prisma: PrismaService,
    private gateway: MessagesGateway,
    private sessions: TripChatSessionsService,
  ) {}

  async create(companyId: string, dispatcherId: string, dto: CreateTripDto) {
    const trip = await this.prisma.trip.create({
      data: {
        title: dto.title,
        dispatcherId,
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
                address: s.address,
                ref: s.ref,
                coords: s.coords,
              })),
            }
          : undefined,
      },
      include: tripInclude,
    });
    await this.sessions.openInitial(trip.id, trip.driverId, trip.dispatcherId);
    return trip;
  }

  async findAll(companyId: string) {
    return this.prisma.trip.findMany({
      where: { companyId },
      include: tripInclude,
      orderBy: { createdAt: 'desc' },
    });
  }

  // trips for a specific truck (Chat + Trips tabs)
  async findByTruck(truckId: string, companyId: string) {
    return this.prisma.trip.findMany({
      where: { truckId, companyId },
      include: tripInclude,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, companyId: string) {
    const trip = await this.prisma.trip.findFirst({
      where: { id, companyId },
      include: tripInclude,
    });
    if (!trip) throw new NotFoundException('Рейс не знайдений');
    return trip;
  }

  // Driver's own trips — used by the driver mobile app.
  async findMyTrips(driverId: string) {
    return this.prisma.trip.findMany({
      where: { driverId },
      include: tripInclude,
      orderBy: { createdAt: 'desc' },
    });
  }

  // Currently active trip for the driver (any non-DELIVERED status).
  // Перевіряємо також що трак ЗАРАЗ належить цьому водію —
  // щоб не повернути старий тріп після переводу водія на інший трак.
  async findMyActiveTrip(driverId: string) {
    const active = await this.prisma.trip.findFirst({
      where: {
        driverId,
        status: { in: [...ACTIVE_STATUSES] },
        truck: { currentDriverId: driverId },
      },
      include: tripInclude,
      orderBy: { createdAt: 'desc' },
    });
    return active ?? null;
  }

  // load message history for a trip.
  // Privacy: requester sees only sessions they participated in (or all if
  // they're a manager). Drivers retained across a dispatcher swap see both
  // their old and new chats as one continuous stream.
  async getMessages(
    tripId: string,
    companyId: string,
    requester: { id: string; role: string },
  ) {
    const trip = await this.prisma.trip.findFirst({
      where: { id: tripId, companyId },
    });
    if (!trip) throw new NotFoundException('Рейс не знайдений');

    const sessionIds = await this.sessions.getVisibleSessionIds(tripId, requester);
    if (sessionIds.length === 0) return [];

    return this.prisma.message.findMany({
      where: { sessionId: { in: sessionIds } },
      include: {
        sender: { select: { id: true, name: true, role: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async updateStatus(id: string, companyId: string, dto: UpdateTripDto) {
    await this.findOne(id, companyId);
    return this.prisma.trip.update({
      where: { id },
      data: { status: dto.status },
    });
  }

  // update trip info (notes + stops) — replaces all stops
  async updateInfo(id: string, companyId: string, dto: UpdateTripDto) {
    await this.findOne(id, companyId);

    if (dto.stops !== undefined) {
      // delete all existing stops then recreate
      await this.prisma.tripStop.deleteMany({ where: { tripId: id } });
      if (dto.stops.length > 0) {
        await this.prisma.tripStop.createMany({
          data: dto.stops.map((s, i) => ({
            tripId: id,
            type: s.type,
            order: s.order ?? i,
            address: s.address,
            ref: s.ref,
            coords: s.coords,
          })),
        });
      }
    }

    return this.prisma.trip.update({
      where: { id },
      data: { notes: dto.notes, orderNumber: dto.orderNumber },
      include: tripInclude,
    });
  }

  /** Reassign a trip to a different driver (dispatcher action).
   *  Якщо водій змінюється — закриваємо поточну чат-сесію і відкриваємо нову,
   *  щоб новий водій бачив чистий чат. Стара переписка зберігається в архіві. */
  async assignDriver(
    id: string,
    companyId: string,
    driverId: string,
    triggeredById: string,
  ) {
    const trip = await this.prisma.trip.findFirst({
      where: { id, companyId },
    });
    if (!trip) throw new NotFoundException('Рейс не знайдений');

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
        trip.dispatcherId,
        triggeredById,
      );
      this.gateway.server.to(id).emit('tripUpdated', { tripId: id });
      if (trip.companyId) {
        this.gateway.server
          .to(`company-${trip.companyId}`)
          .emit('tripUpdated', { tripId: id });
      }
      if (systemMessage) {
        this.gateway.server.to(id).emit('newMessage', systemMessage);
        if (trip.companyId) {
          this.gateway.server
            .to(`company-${trip.companyId}`)
            .emit('newMessage', systemMessage);
        }
      }
    }

    return updated;
  }

  /** Reassign an existing trip to a different dispatcher. */
  async assignDispatcher(
    id: string,
    companyId: string,
    dispatcherId: string,
    triggeredById: string,
  ) {
    const trip = await this.prisma.trip.findFirst({
      where: { id, companyId },
    });
    if (!trip) throw new NotFoundException('Рейс не знайдений');

    const dispatcherChanged = trip.dispatcherId !== dispatcherId;

    const updated = await this.prisma.trip.update({
      where: { id },
      data: { dispatcherId },
      include: tripInclude,
    });

    if (dispatcherChanged) {
      const { systemMessage } = await this.sessions.closeAndOpenNew(
        id,
        'DISPATCHER_CHANGED',
        trip.driverId,
        dispatcherId,
        triggeredById,
      );
      this.gateway.server.to(id).emit('tripUpdated', { tripId: id });
      if (trip.companyId) {
        this.gateway.server
          .to(`company-${trip.companyId}`)
          .emit('tripUpdated', { tripId: id });
      }
      if (systemMessage) {
        this.gateway.server.to(id).emit('newMessage', systemMessage);
        if (trip.companyId) {
          this.gateway.server
            .to(`company-${trip.companyId}`)
            .emit('newMessage', systemMessage);
        }
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
      where: { id, driverId },
    });
    if (!trip) throw new ForbiddenException('No access to this trip');
    return this.prisma.trip.update({
      where: { id },
      data: { status: dto.status },
    });
  }

  async remove(id: string, companyId: string) {
    const trip = await this.findOne(id, companyId);
    await this.prisma.trip.delete({ where: { id } });
    return { message: `Trip ${trip.title} deleted!` };
  }

  async broadcastToMyTrucks(userId: string, companyId: string, content: string) {
    const trips = await this.prisma.trip.findMany({
      where: {
        companyId,
        status: { in: [...ACTIVE_STATUSES] },
        truck: { dispatcherId: userId },
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
          include: { sender: { select: { id: true, name: true, role: true } } },
        });
        this.gateway.server.to(trip.id).emit('newMessage', message);
        return message;
      }),
    );

    return { sent: results.filter(Boolean).length };
  }
}
