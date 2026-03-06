import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateGroupDto } from './dto/create-group.dto';
import { UpdateGroupDto } from './dto/update-group.dto';

@Injectable()
export class GroupsService {
  constructor(private prisma: PrismaService) {}

  async create(
    companyId: string,
    userId: string,
    role: string,
    dto: CreateGroupDto,
  ) {
    if (dto.type === 'DISPATCHERS' && role === 'DISPATCHER') {
      throw new ForbiddenException(
        'Диспетчер не може створювати групи диспетчерів',
      );
    }
    if (dto.type === 'TRUCKS' && role === 'TEAMLEAD') {
      throw new ForbiddenException(
        'Тімлід не може створювати групи вантажівок',
      );
    }

    return await this.prisma.group.create({
      data: {
        name: dto.name,
        type: dto.type,
        companyId,
        createdBy: userId,
      },
    });
  }

  async findAll(companyId: string | null, _role: string, _userId: string) {
    return await this.prisma.group.findMany({
      where: companyId ? { companyId } : {},
      include: {
        creator: { select: { id: true, name: true, role: true } },
        trucks: { include: { truck: true } },
        dispatchers: {
          include: { dispatcher: { select: { id: true, name: true } } },
        },
      },
    });
  }

  async update(id: string, userId: string, role: string, dto: UpdateGroupDto) {
    const group = await this.prisma.group.findFirst({ where: { id } });
    if (!group) throw new NotFoundException('Група не знайдена');

    if (role === 'DISPATCHER' && group.createdBy !== userId) {
      throw new ForbiddenException('Можна редагувати тільки свої групи');
    }

    return this.prisma.group.update({
      where: { id },
      data: { name: dto.name },
    });
  }

  async remove(id: string, userId: string, role: string) {
    const group = await this.prisma.group.findFirst({ where: { id } });
    if (!group) throw new NotFoundException('Група не знайдена');

    if (role === 'DISPATCHER' && group.createdBy !== userId) {
      throw new ForbiddenException('Можна видаляти тільки свої групи');
    }

    await this.prisma.group.delete({ where: { id } });
    return { message: `Група ${group.name} видалена` };
  }

  async addTruck(
    groupId: string,
    truckId: string,
    userId: string,
    role: string,
  ) {
    const group = await this.prisma.group.findFirst({ where: { id: groupId } });
    if (!group) throw new NotFoundException('Група не знайдена');

    if (role === 'DISPATCHER' && group.createdBy !== userId) {
      throw new ForbiddenException('Можна редагувати тільки свої групи');
    }
    if (group.type !== 'TRUCKS') {
      throw new ForbiddenException(
        'Це група диспетчерів — не можна додавати вантажівки',
      );
    }

    return this.prisma.groupTruck.create({
      data: { groupId, truckId },
    });
  }

  async removeTruck(
    groupId: string,
    truckId: string,
    userId: string,
    role: string,
  ) {
    const groupTruck = await this.prisma.groupTruck.findFirst({
      where: { groupId, truckId },
    });
    if (!groupTruck)
      throw new NotFoundException('Вантажівка не знайдена в групі');

    const group = await this.prisma.group.findFirst({ where: { id: groupId } });
    if (role === 'DISPATCHER' && group!.createdBy !== userId) {
      throw new ForbiddenException('Можна редагувати тільки свої групи');
    }

    await this.prisma.groupTruck.delete({ where: { id: groupTruck.id } });
    return { message: 'Вантажівка видалена з групи' };
  }

  async addDispatcher(groupId: string, dispatcherId: string) {
    const group = await this.prisma.group.findFirst({ where: { id: groupId } });
    if (!group) throw new NotFoundException('Група не знайдена');

    if (group.type !== 'DISPATCHERS') {
      throw new ForbiddenException(
        'Це група вантажівок — не можна додавати диспетчерів',
      );
    }

    const user = await this.prisma.user.findFirst({
      where: { id: dispatcherId },
    });
    if (!user || user.role !== 'DISPATCHER') {
      throw new ForbiddenException('Можна додавати тільки диспетчерів');
    }

    return this.prisma.groupDispatcher.create({
      data: { groupId, dispatcherId },
    });
  }

  async removeDispatcher(groupId: string, dispatcherId: string) {
    const groupDispatcher = await this.prisma.groupDispatcher.findFirst({
      where: { groupId, dispatcherId },
    });
    if (!groupDispatcher)
      throw new NotFoundException('Диспетчер не знайдений в групі');

    await this.prisma.groupDispatcher.delete({
      where: { id: groupDispatcher.id },
    });
    return { message: 'Диспетчер видалений з групи' };
  }
  async findAllTrucks(companyId: string | null) {
    return await this.prisma.group.findMany({
      where: companyId ? { companyId, type: 'TRUCKS' } : { type: 'TRUCKS' },
      include: {
        creator: { select: { id: true, name: true, role: true } },
        trucks: {
          include: {
            truck: {
              select: {
                id: true,
                plate: true,
                status: true,
                currentDriver: { select: { id: true, name: true } },
              },
            },
          },
        },
      },
    });
  }

  async findAllDispatchers(companyId: string | null) {
    return await this.prisma.group.findMany({
      where: companyId
        ? { companyId, type: 'DISPATCHERS' }
        : { type: 'DISPATCHERS' },
      include: {
        creator: { select: { id: true, name: true, role: true } },
        dispatchers: {
          include: {
            dispatcher: { select: { id: true, name: true } },
          },
        },
      },
    });
  }
}
