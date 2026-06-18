import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { SupabaseStorageService } from 'src/supabase-storage/supabase-storage.service';
import { CreateGroupDto } from './dto/create-group.dto';
import { UpdateGroupDto } from './dto/update-group.dto';

@Injectable()
export class GroupsService {
  constructor(
    private prisma: PrismaService,
    private storage: SupabaseStorageService,
  ) {}

  /**
   * Authorize an avatar mutation. Creator + every member manager + ADMIN
   * are allowed; everyone else hits 403. Keeping this in one place so the
   * upload / delete endpoints can't drift apart on access rules.
   */
  private async assertCanEditGroup(
    groupId: string,
    userId: string,
    role: string,
  ) {
    const group = await this.prisma.group.findFirst({
      where: { id: groupId },
      select: { id: true, createdBy: true },
    });
    if (!group) throw new NotFoundException('Група не знайдена');
    if (role === 'ADMIN' || group.createdBy === userId) return;
    const membership = await this.prisma.groupManager.findFirst({
      where: { groupId, managerId: userId },
      select: { id: true },
    });
    if (!membership) {
      throw new ForbiddenException('Лише учасники групи можуть редагувати її.');
    }
  }

  async uploadAvatar(
    groupId: string,
    userId: string,
    role: string,
    file: Express.Multer.File,
  ) {
    await this.assertCanEditGroup(groupId, userId, role);
    const current = await this.prisma.group.findUnique({
      where: { id: groupId },
      select: { avatarPublicId: true },
    });
    if (current?.avatarPublicId) {
      await this.storage.deleteFile(current.avatarPublicId);
    }
    const { url, storagePath } = await this.storage.uploadWithUrl(
      file,
      'group-avatars',
    );
    return this.prisma.group.update({
      where: { id: groupId },
      data: { avatar: url, avatarPublicId: storagePath },
    });
  }

  async deleteAvatar(groupId: string, userId: string, role: string) {
    await this.assertCanEditGroup(groupId, userId, role);
    const current = await this.prisma.group.findUnique({
      where: { id: groupId },
      select: { avatarPublicId: true },
    });
    if (current?.avatarPublicId) {
      await this.storage.deleteFile(current.avatarPublicId);
    }
    return this.prisma.group.update({
      where: { id: groupId },
      data: { avatar: null, avatarPublicId: null },
    });
  }

  async create(
    companyId: string,
    userId: string,
    _role: string,
    dto: CreateGroupDto,
  ) {
    // Any logged-in MANAGER/TEAMLEAD/ADMIN can create groups of any type.
    return await this.prisma.group.create({
      data: {
        name: dto.name,
        type: dto.type,
        companyId,
        createdBy: userId,
        // Auto-add the creator as a member so they appear in the Members
        // list (only for MANAGERS-type groups; TRUCKS uses a different
        // relation).
        ...(dto.type === 'MANAGERS' && {
          managers: { create: { managerId: userId } },
        }),
      },
    });
  }

  async findAll(companyId: string | null, _role: string, _userId: string) {
    return await this.prisma.group.findMany({
      where: companyId ? { companyId } : {},
      include: {
        creator: { select: { id: true, firstName: true, lastName: true, avatar: true, status: true, statusUntil: true, role: true } },
        trucks: { include: { truck: true } },
        managers: {
          include: { manager: { select: { id: true, firstName: true, lastName: true, avatar: true, status: true, statusUntil: true, email: true, role: true } } },
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
    // Frontend's member picker lists MANAGER + TEAMLEAD (a teamlead is
    // effectively a senior manager and belongs in manager chats); the API
    // used to reject TEAMLEAD with 403, which left the picker advertising
    // people the server then refused to add.
    if (!user || (user.role !== 'MANAGER' && user.role !== 'TEAMLEAD')) {
      throw new ForbiddenException(
        'Можна додавати тільки менеджерів або тімлідів',
      );
    }

    // Idempotent add: if this user is already in the group, return the
    // existing row instead of crashing on the unique constraint (which
    // would surface as a confusing 500 on a second click).
    const existing = await this.prisma.groupManager.findFirst({
      where: { groupId, managerId },
    });
    if (existing) return existing;

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
        creator: { select: { id: true, firstName: true, lastName: true, avatar: true, status: true, statusUntil: true, role: true } },
        trucks: {
          include: {
            truck: {
              select: {
                id: true,
                plate: true,
                status: true,
                currentDriver: { select: { id: true, firstName: true, lastName: true, avatar: true } },
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
        creator: { select: { id: true, firstName: true, lastName: true, avatar: true, status: true, statusUntil: true, role: true } },
        managers: {
          include: {
            manager: { select: { id: true, firstName: true, lastName: true, avatar: true, status: true, statusUntil: true, email: true, role: true } },
          },
        },
      },
    });
  }
}
