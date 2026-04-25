import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateTripDto } from './dto/create-trip.dto';
import { UpdateTripDto } from './dto/update-trip.dto';
import { MessagesGateway } from '../messages/messages.gateway';

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
  ) {}

  async create(companyId: string, dispatcherId: string, dto: CreateTripDto) {
    return this.prisma.trip.create({
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

  // load message history for a trip
  async getMessages(tripId: string, companyId: string) {
    const trip = await this.prisma.trip.findFirst({
      where: { id: tripId, companyId },
    });
    if (!trip) throw new NotFoundException('Рейс не знайдений');

    return this.prisma.message.findMany({
      where: { tripId },
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
        const message = await this.prisma.message.create({
          data: { tripId: trip.id, senderId: userId, content },
          include: { sender: { select: { id: true, name: true, role: true } } },
        });
        this.gateway.server.to(trip.id).emit('newMessage', message);
        return message;
      }),
    );

    return { sent: results.length };
  }
}
