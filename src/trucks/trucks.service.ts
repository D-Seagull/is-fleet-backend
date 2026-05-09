import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateTruckDto } from './dto/create-truck.dto';
import { UpdateTruckDto } from './dto/update-truck.dto';
import { CreateTruckNoteDto } from './dto/create-truck-note.dto';
import { TripChatSessionsService } from '../messages/trip-chat-sessions.service';
import { MessagesGateway } from '../messages/messages.gateway';

const ACTIVE_TRIP_STATUSES = [
  'ASSIGNED',
  'ACCEPTED',
  'ON_WAY',
  'ON_SITE',
  'LOADED',
] as const;

@Injectable()
export class TrucksService {
  constructor(
    private prisma: PrismaService,
    private sessions: TripChatSessionsService,
    private gateway: MessagesGateway,
  ) {}

  async create(companyId: string, dto: CreateTruckDto) {
    return this.prisma.truck.create({
      data: {
        ...dto,
        companyId,
      },
    });
  }

  async findAll(companyId: string) {
    return this.prisma.truck.findMany({
      where: { companyId, isActive: true },
      include: {
        currentDriver: {
          select: { id: true, name: true, phone: true },
        },
        dispatcher: {
          select: { id: true, name: true },
        },
        truckNotes: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { content: true, createdAt: true },
        },
      },
    });
  }

  async findOne(id: string, companyId: string) {
    const truck = await this.prisma.truck.findFirst({
      where: { id, companyId },
      include: {
        currentDriver: {
          select: { id: true, name: true, phone: true },
        },
        dispatcher: {
          select: { id: true, name: true },
        },
      },
    });
    if (!truck) throw new NotFoundException('truck not found');
    return truck;
  }

  async update(
    id: string,
    companyId: string,
    dto: UpdateTruckDto,
    triggeredById: string,
  ) {
    const oldTruck = await this.findOne(id, companyId);

    // Якщо новий водій вже закріплений за іншою вантажівкою — спершу
    // звільнюємо стару (currentDriverId @unique забороняє два посилання
    // на одного водія, тож без цього кроку Prisma кине помилку).
    let detachedFromTruckId: string | null = null;
    if (
      dto.currentDriverId !== undefined &&
      dto.currentDriverId !== null &&
      dto.currentDriverId !== oldTruck.currentDriverId
    ) {
      const previousTruck = await this.prisma.truck.findFirst({
        where: {
          currentDriverId: dto.currentDriverId,
          id: { not: id },
        },
        select: { id: true },
      });
      if (previousTruck) {
        await this.prisma.truck.update({
          where: { id: previousTruck.id },
          data: { currentDriverId: null },
        });
        detachedFromTruckId = previousTruck.id;
      }
    }

    const updated = await this.prisma.truck.update({
      where: { id },
      data: dto,
    });

    // Push the change to everyone who needs to refresh: the company room
    // (so dispatchers' truck lists update) and the driver's personal room
    // (so the mobile app drops/picks up the truck immediately).
    const driverChanged =
      dto.currentDriverId !== undefined &&
      dto.currentDriverId !== oldTruck.currentDriverId;
    if (driverChanged || detachedFromTruckId) {
      const payload = {
        truckId: id,
        previousTruckId: detachedFromTruckId,
        newDriverId: dto.currentDriverId ?? null,
        previousDriverId: oldTruck.currentDriverId ?? null,
      };
      this.gateway.server
        .to(`company-${companyId}`)
        .emit('truckChanged', payload);
      // Also target the driver's personal room (mobile app stays connected
      // here even when the chat screen isn't open).
      if (oldTruck.currentDriverId) {
        this.gateway.server
          .to(oldTruck.currentDriverId)
          .emit('truckChanged', payload);
      }
      if (dto.currentDriverId) {
        this.gateway.server
          .to(dto.currentDriverId)
          .emit('truckChanged', payload);
      }
    }

    // Якщо диспетчер вантажівки змінився — синхронізуємо це з активними
    // тріпами (Trip.dispatcherId) і закриваємо/відкриваємо чат-сесії, щоб
    // новий диспетчер бачив чистий чат, а стара переписка лишилась в архіві.
    const dispatcherChanged =
      dto.dispatcherId !== undefined &&
      dto.dispatcherId !== oldTruck.dispatcherId &&
      dto.dispatcherId !== null;

    // Push truckChanged on dispatcher swap too — drivers' mobile app shows
    // the new dispatcher in the drawer, other web dispatchers see the new
    // assignment in their truck list, all without manual refresh.
    if (dispatcherChanged) {
      const payload = {
        truckId: id,
        previousTruckId: null as string | null,
        newDriverId: oldTruck.currentDriverId ?? null,
        previousDriverId: oldTruck.currentDriverId ?? null,
      };
      this.gateway.server
        .to(`company-${companyId}`)
        .emit('truckChanged', payload);
      if (oldTruck.currentDriverId) {
        this.gateway.server
          .to(oldTruck.currentDriverId)
          .emit('truckChanged', payload);
      }
    }

    if (dispatcherChanged) {
      const newDispatcherId = dto.dispatcherId as string;
      const activeTrips = await this.prisma.trip.findMany({
        where: {
          truckId: id,
          status: { in: [...ACTIVE_TRIP_STATUSES] },
        },
        select: { id: true, driverId: true, dispatcherId: true },
      });

      for (const trip of activeTrips) {
        if (trip.dispatcherId === newDispatcherId) continue;
        await this.prisma.trip.update({
          where: { id: trip.id },
          data: { dispatcherId: newDispatcherId },
        });
        const { systemMessage } = await this.sessions.closeAndOpenNew(
          trip.id,
          'DISPATCHER_CHANGED',
          trip.driverId,
          newDispatcherId,
          triggeredById,
        );
        this.gateway.server.to(trip.id).emit('tripUpdated', { tripId: trip.id });
        this.gateway.server
          .to(`company-${companyId}`)
          .emit('tripUpdated', { tripId: trip.id });
        if (systemMessage) {
          this.gateway.server.to(trip.id).emit('newMessage', systemMessage);
          this.gateway.server
            .to(`company-${companyId}`)
            .emit('newMessage', systemMessage);
        }
      }
    }

    return updated;
  }

  /** Returns the truck currently assigned to a driver (driver-side endpoint). */
  async findDriverTruck(driverId: string) {
    return this.prisma.truck.findFirst({
      where: { currentDriverId: driverId, isActive: true },
      include: {
        dispatcher: {
          select: { id: true, name: true, phone: true, avatar: true },
        },
        truckNotes: {
          orderBy: { createdAt: 'desc' },
          include: {
            user: { select: { id: true, name: true, role: true } },
          },
        },
      },
    });
  }

  async findMyTrucks(userId: string, companyId: string) {
    return this.prisma.truck.findMany({
      where: { companyId, isActive: true, dispatcherId: userId },
      include: {
        currentDriver: {
          select: { id: true, name: true, phone: true },
        },
        truckNotes: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { content: true, createdAt: true },
        },
      },
    });
  }

  async findDeactivated(companyId: string) {
    return this.prisma.truck.findMany({
      where: { companyId, isActive: false },
      include: {
        currentDriver: { select: { id: true, name: true, phone: true } },
      },
    });
  }

  async activate(id: string, companyId: string) {
    await this.prisma.truck.update({
      where: { id },
      data: { isActive: true },
    });
    return { message: 'Truck activated' };
  }

  async remove(id: string, companyId: string) {
    const truck = await this.findOne(id, companyId);
    await this.prisma.truck.update({
      where: { id },
      data: { isActive: false },
    });
    return { message: `Truck ${truck.plate} deactivated` };
  }

  /*Notes */
  async createNote(
    truckId: string,
    companyId: string,
    userId: string,
    dto: CreateTruckNoteDto,
  ) {
    const truck = await this.findOne(truckId, companyId);
    if (!truck) return;
    return this.prisma.truckNote.create({
      data: {
        truckId,
        userId,
        content: dto.content,
      },
      include: {
        user: { select: { id: true, name: true, role: true } },
      },
    });
  }

  async getNotes(truckId: string) {
    return this.prisma.truckNote.findMany({
      where: { truckId },
      include: {
        user: { select: { id: true, name: true, role: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async removeNote(id: string, userId: string) {
    const note = await this.prisma.truckNote.findFirst({
      where: { id, userId },
    });
    if (!note) throw new NotFoundException('Note not found');

    await this.prisma.truckNote.delete({ where: { id } });
    return { message: 'Note deleted' };
  }
}
