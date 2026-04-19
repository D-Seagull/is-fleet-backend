import {
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
    const users = await this.prisma.user.findMany({
      where: companyId ? { companyId } : {},
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        avatar: true,
        role: true,
        language: true,
        isActive: true,
        createdAt: true,
        dispatcher: { select: { id: true, name: true } },
        currentTruck: { select: { id: true, plate: true, status: true } },
        company: { select: { name: true } },
        _count: { select: { ratingsReceived: true } },
        ratingsReceived: { select: { score: true } },
      },
    });

    return users.map(({ ratingsReceived, _count, ...u }) => ({
      ...u,
      ratingCount: _count.ratingsReceived,
      averageRating:
        ratingsReceived.length > 0
          ? ratingsReceived.reduce((s, r) => s + r.score, 0) /
            ratingsReceived.length
          : null,
    }));
  }
  async updateDriver(
    id: string,
    companyId: string | null,
    dto: { phone?: string; dispatcherId?: string | null; truckId?: string | null },
  ) {
    const user = await this.prisma.user.findFirst({
      where: companyId ? { id, companyId } : { id },
    });
    if (!user) throw new NotFoundException('User not found');

    if (dto.truckId !== undefined) {
      // unassign from old truck
      await this.prisma.truck.updateMany({
        where: { currentDriverId: id },
        data: { currentDriverId: null },
      });
      // assign to new truck
      if (dto.truckId) {
        await this.prisma.truck.update({
          where: { id: dto.truckId },
          data: { currentDriverId: id },
        });
      }
    }

    return this.prisma.user.update({
      where: { id },
      data: {
        ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
        ...(dto.dispatcherId !== undefined ? { dispatcherId: dto.dispatcherId } : {}),
      },
      select: {
        id: true,
        name: true,
        phone: true,
        dispatcherId: true,
        dispatcher: { select: { id: true, name: true } },
        currentTruck: { select: { id: true, plate: true, status: true } },
      },
    });
  }

  async activate(id: string, companyId: string | null) {
    const user = await this.prisma.user.findFirst({
      where: companyId ? { id, companyId } : { id },
    });
    if (!user) throw new NotFoundException('User not found');

    await this.prisma.user.update({
      where: { id },
      data: { isActive: true },
    });

    return { message: `User ${user.name} activated!` };
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
        phone: true,
        avatar: true,
        role: true,
        language: true,
        isActive: true,
        teamleadId: true,
        companyId: true,
        createdAt: true,
        dispatcher: {
          select: { id: true, name: true, email: true },
        },
        currentTruck: {
          select: { id: true, plate: true, status: true },
        },
        ratingsReceived: {
          select: {
            id: true,
            score: true,
            comment: true,
            anonymous: true,
            createdAt: true,
            ratedBy: { select: { id: true, name: true, role: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!user) throw new NotFoundException('Користувач не знайдений');

    const raw = user.ratingsReceived;
    const averageRating =
      raw.length > 0
        ? raw.reduce((sum, r) => sum + r.score, 0) / raw.length
        : null;

    const ratingsReceived = raw.map(({ anonymous, ratedBy, ...r }) => ({
      ...r,
      anonymous,
      ratedBy: anonymous
        ? { id: ratedBy.id, name: 'Anonymous', role: '' }
        : ratedBy,
    }));

    return { ...user, ratingsReceived, averageRating, ratingCount: raw.length };
  }
  async upsertRating(
    driverId: string,
    ratedById: string,
    score: number,
    comment?: string,
    anonymous?: boolean,
  ) {
    return this.prisma.driverRating.upsert({
      where: { driverId_ratedById: { driverId, ratedById } },
      create: { driverId, ratedById, score, comment, anonymous: anonymous ?? false },
      update: { score, comment, anonymous: anonymous ?? false },
    });
  }

  async getDriverRatings(driverId: string) {
    const ratings = await this.prisma.driverRating.findMany({
      where: { driverId },
      select: {
        id: true,
        score: true,
        comment: true,
        anonymous: true,
        createdAt: true,
        ratedBy: { select: { id: true, name: true, role: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const averageRating =
      ratings.length > 0
        ? ratings.reduce((s, r) => s + r.score, 0) / ratings.length
        : null;

    const masked = ratings.map(({ anonymous, ratedBy, ...r }) => ({
      ...r,
      anonymous,
      ratedBy: anonymous
        ? { id: ratedBy.id, name: 'Anonymous', role: '' }
        : ratedBy,
    }));

    return { ratings: masked, averageRating, ratingCount: ratings.length };
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
