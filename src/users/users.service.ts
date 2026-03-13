import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { CreateDispatcherDto } from './dto/create-dispatcher.dto';
import { CreateDriverDto } from './dto/create-driver.dto';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async createDispatcher(
    companyId: string,
    creatorId: string,
    dto: CreateDispatcherDto,
  ) {
    const hash = await bcrypt.hash(dto.password, 10);
    const newUser = await this.prisma.user.create({
      data: {
        name: dto.name,
        email: dto.email,
        password: hash,
        role: 'DISPATCHER',
        language: dto.language ?? 'EN',
        companyId,
        teamleadId: creatorId,
      },
    });
    const { password, ...result } = newUser;
    return result;
  }

  async createDriver(
    companyId: string,
    creatorId: string,
    dto: CreateDriverDto,
  ) {
    const hash = dto.password ? await bcrypt.hash(dto.password, 10) : null;
    const newDriver = await this.prisma.user.create({
      data: {
        name: dto.name,
        phone: dto.phone,
        email: dto.email,
        password: hash,
        role: 'DRIVER',
        language: dto.language ?? 'EN',
        companyId,
        dispatcherId: creatorId,
      },
    });
    const { password, ...result } = newDriver;
    return result;
  }

  async getCompanyUsers(companyId: string | null) {
    return this.prisma.user.findMany({
      where: companyId ? { companyId } : {},
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        isActive: true,
        createdAt: true,
        company: {
          select: {
            name: true,
          },
        },
      },
    });
  }
  async deactivate(
    id: string,
    companyId: string | null,
    requesterRole: string,
  ) {
    const user = await this.prisma.user.findFirst({
      where: companyId ? { id, companyId } : { id },
    });
    if (!user) throw new NotFoundException('User not found');

    if (user.role === 'TEAMLEAD' && requesterRole !== 'ADMIN') {
      throw new ForbiddenException('Only an admin can deactivate this user');
    }

    if (user.role === 'DISPATCHER' && requesterRole === 'DISPATCHER') {
      throw new ForbiddenException(
        'You do not have permission to deactivate this user',
      );
    }

    await this.prisma.user.update({
      where: { id },
      data: { isActive: false },
    });

    return { message: `User ${user.name} deactivated!` };
  }
  async getUserById(id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        language: true,
        teamleadId: true,
        companyId: true,
        createdAt: true,
      },
    });
    if (!user) throw new NotFoundException('Користувач не знайдений');
    return user;
  }
}
