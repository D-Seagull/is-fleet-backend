import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateTripDto } from './dto/create-trip.dto';
import { UpdateTripDto } from './dto/update-trip.dto';

@Injectable()
export class TripsService {
  constructor(private prisma: PrismaService) {}

  async create(companyId: string, dispatcherId: string, dto: CreateTripDto) {
    return this.prisma.trip.create({
      data: {
        title: dto.title,
        dispatcherId,
        driverId: dto.driverId,
        truckId: dto.truckId,
        companyId,
      },
      include: {
        driver: { select: { id: true, name: true, phone: true } },
        truck: { select: { id: true, plate: true } },
        dispatcher: { select: { id: true, name: true } },
      },
    });
  }

  async findAll(companyId: string) {
    return this.prisma.trip.findMany({
      where: { companyId },
      include: {
        driver: { select: { id: true, name: true, phone: true } },
        truck: { select: { id: true, plate: true } },
        dispatcher: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, companyId: string) {
    const trip = await this.prisma.trip.findFirst({
      where: { id, companyId },
      include: {
        driver: { select: { id: true, name: true, phone: true } },
        truck: { select: { id: true, plate: true } },
        dispatcher: { select: { id: true, name: true } },
      },
    });
    if (!trip) throw new NotFoundException('Рейс не знайдений');
    return trip;
  }

  async updateStatus(id: string, companyId: string, dto: UpdateTripDto) {
    await this.findOne(id, companyId);
    return this.prisma.trip.update({
      where: { id },
      data: { status: dto.status },
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
    await this.prisma.trip.delete({
      where: { id },
    });
    return { message: `Trip ${trip.title} deleted!` };
  }
}
