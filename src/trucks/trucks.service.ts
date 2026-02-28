import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateTruckDto } from './dto/create-truck.dto';
import { UpdateTruckDto } from './dto/update-truck.dto';

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
      where: { companyId },
      include: {
        currentDriver: {
          select: { id: true, name: true, phone: true },
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

  async remove(id: string, companyId: string) {
    const truck = await this.findOne(id, companyId);
    await this.prisma.truck.delete({
      where: { id },
    });
    return { message: `Truck ${truck.plate} removed!` };
  }
}
