import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { CreateDispatcherDto } from './dto/create-dispatcher.dto';
import { CreateDriverDto } from './dto/create-driver.dto';
import { CloudinaryService } from 'src/cloudinary/cloudinary.service';
import { v4 as uuidv4 } from 'uuid';
import { MailService } from 'src/mail/mail.service';

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private cloudinary: CloudinaryService,
    private mail: MailService,
  ) {}

  async createDispatcher(
    companyId: string,
    creatorId: string,
    dto: CreateDispatcherDto,
  ) {
    const inviteToken = uuidv4();
    const inviteExpiry = new Date();
    inviteExpiry.setDate(inviteExpiry.getDate() + 7);

    // const existing = await this.prisma.user.findFirst({
    //   where: { email: dto.email },
    // });

    // if (existing)
    //   throw new BadRequestException('User with this email already created');

    // Створюємо юзера без пароля — він встановить його при реєстрації
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        role: 'DISPATCHER',
        companyId,
        inviteToken,
        inviteExpiry,
      },
    });

    const inviteLink = `${process.env.FRONTEND_URL}/register?token=${inviteToken}`;

    await this.mail.sendDispatcherInvite(dto.email, inviteLink);

    return user;
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
  async uploadAvatar(userId: string, file: Express.Multer.File) {
    const user = await this.prisma.user.findFirst({ where: { id: userId } });

    if (user?.avatarPublicId) {
      await this.cloudinary.deleteFile(user.avatarPublicId as string);
    }

    const { url, publicId } = await this.cloudinary.uploadFile(file);

    return this.prisma.user.update({
      where: { id: userId },
      data: { avatar: url, avatarPublicId: publicId },
    });
  }

  async deleteAvatar(userId: string) {
    const user = await this.prisma.user.findFirst({ where: { id: userId } });

    if (user?.avatarPublicId) {
      await this.cloudinary.deleteFile(user.avatarPublicId as string);
    }

    return this.prisma.user.update({
      where: { id: userId },
      data: { avatar: null, avatarPublicId: null },
    });
  }
}
