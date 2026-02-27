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

  async createDispatcher(companyId: string, dto: CreateDispatcherDto) {
    const hash = await bcrypt.hash(dto.password, 10);
    const newUser = await this.prisma.user.create({
      data: {
        name: dto.name,
        email: dto.email,
        password: hash,
        role: 'DISPATCHER',
        companyId,
      },
    });
    const { password, ...result } = newUser;
    return result;
  }

  async createDriver(companyId: string, dto: CreateDriverDto) {
    const newDriver = await this.prisma.user.create({
      data: {
        name: dto.name,
        phone: dto.phone,
        role: 'DRIVER',
        companyId,
      },
    });
    const { password, ...result } = newDriver;
    return result;
  }

  async getCompanyUsers(companyId: string) {
    return this.prisma.user.findMany({
      where: { companyId },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        createdAt: true,
      },
    });
  }
  async deactivate(id: string, companyId: string, requesterRole: string) {
    const user = await this.prisma.user.findFirst({
      where: requesterRole === 'ADMIN' ? { id } : { id, companyId },
    });
    if (!user) throw new NotFoundException('Користувач не знайдений');

    if (user.role === 'TEAMLEAD' && requesterRole !== 'ADMIN') {
      throw new ForbiddenException('Тільки адмін може деактивувати тімліда');
    }

    if (user.role === 'DISPATCHER' && requesterRole === 'DISPATCHER') {
      throw new ForbiddenException('Диспетчер не може деактивувати диспетчера');
    }

    await this.prisma.user.update({
      where: { id },
      data: { isActive: false },
    });

    return { message: `User ${user.name} deactivated!` };
  }
}
