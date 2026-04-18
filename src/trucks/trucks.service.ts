import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateTruckDto } from './dto/create-truck.dto';
import { UpdateTruckDto } from './dto/update-truck.dto';
import { CreateTruckNoteDto } from './dto/create-truck-note.dto';

@Injectable()
export class TrucksService {
  constructor(private prisma: PrismaService) {}

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
      },
    });
    if (!truck) throw new NotFoundException('truck not found');
    return truck;
  }

  async update(id: string, companyId: string, dto: UpdateTruckDto) {
    await this.findOne(id, companyId);
    return this.prisma.truck.update({
      where: { id },
      data: dto,
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
