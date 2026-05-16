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
    if (dto.type === 'MANAGERS' && role === 'MANAGER') {
      throw new ForbiddenException(
        'Менеджер не може створювати групи менеджерів',
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
        managers: {
          include: { manager: { select: { id: true, name: true } } },
        },
      },
    });
  }

  async update(id: string, userId: string, role: string, dto: UpdateGroupDto) {
    const group = await this.prisma.group.findFirst({ where: { id } });
    if (!group) throw new NotFoundException('Група не знайдена');

    if (role === 'MANAGER' && group.createdBy !== userId) {
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

    if (role === 'MANAGER' && group.createdBy !== userId) {
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

    if (role === 'MANAGER' && group.createdBy !== userId) {
      throw new ForbiddenException('Можна редагувати тільки свої групи');
    }
    if (group.type !== 'TRUCKS') {
      throw new ForbiddenException(
        'Це група менеджерів — не можна додавати вантажівки',
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
    if (role === 'MANAGER' && group!.createdBy !== userId) {
      throw new ForbiddenException('Можна редагувати тільки свої групи');
    }

    await this.prisma.groupTruck.delete({ where: { id: groupTruck.id } });
    return { message: 'Вантажівка видалена з групи' };
  }

  async addManager(groupId: string, managerId: string) {
    const group = await this.prisma.group.findFirst({ where: { id: groupId } });
    if (!group) throw new NotFoundException('Група не знайдена');

    if (group.type !== 'MANAGERS') {
      throw new ForbiddenException(
        'Це група вантажівок — не можна додавати менеджерів',
      );
    }

    const user = await this.prisma.user.findFirst({
      where: { id: managerId },
    });
    if (!user || user.role !== 'MANAGER') {
      throw new ForbiddenException('Можна додавати тільки менеджерів');
    }

    return this.prisma.groupManager.create({
      data: { groupId, managerId },
    });
  }

  async removeManager(groupId: string, managerId: string) {
    const groupManager = await this.prisma.groupManager.findFirst({
      where: { groupId, managerId },
    });
    if (!groupManager)
      throw new NotFoundException('Менеджер не знайдений в групі');

    await this.prisma.groupManager.delete({
      where: { id: groupManager.id },
    });
    return { message: 'Менеджер видалений з групи' };
  }

  async findAllTrucksGroups(companyId: string | null) {
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

  async findAllManagersGroups(
    companyId: string | null,
    role?: string,
    userId?: string,
  ) {
    const where: Record<string, unknown> = companyId
      ? { companyId, type: 'MANAGERS' }
      : { type: 'MANAGERS' };

    if (role === 'MANAGER' && userId) {
      where.managers = { some: { managerId: userId } };
    }

    return await this.prisma.group.findMany({
      where,
      include: {
        creator: { select: { id: true, name: true, role: true } },
        managers: {
          include: {
            manager: { select: { id: true, name: true } },
          },
        },
      },
    });
  }
}
