import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { Prisma } from '@prisma/client';
import { CreateManagerDto } from './dto/create-manager.dto';
import { CreateDriverDto } from './dto/create-driver.dto';
import { SupabaseStorageService } from 'src/supabase-storage/supabase-storage.service';
import { v4 as uuidv4 } from 'uuid';
import { MailService } from 'src/mail/mail.service';
import { normalizePhone as toCanonicalPhone } from 'src/common/utils/phone';

/** Same as shared util but throws 400 — used by create flows. */
function requireValidPhone(input: string): string {
  const canonical = toCanonicalPhone(input);
  if (!canonical) {
    throw new BadRequestException(
      'Phone must be in international format, e.g. +380501234567',
    );
  }
  return canonical;
}

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private storage: SupabaseStorageService,
    private mail: MailService,
  ) {}

  async createManager(
    companyId: string,
    creatorId: string,
    dto: CreateManagerDto,
  ) {
    const inviteToken = uuidv4();
    const inviteExpiry = new Date();
    inviteExpiry.setDate(inviteExpiry.getDate() + 7);

    const phone = requireValidPhone(dto.phone);

    // Створюємо юзера без пароля — він встановить його при реєстрації
    try {
      const user = await this.prisma.user.create({
        data: {
          email: dto.email,
          phone,
          name: dto.name?.trim() ?? null,
          role: 'MANAGER',
          companyId,
          teamleadId: creatorId,
          language: dto.language,
          inviteToken,
          inviteExpiry,
        },
      });

      const inviteLink = `${process.env.FRONTEND_URL}/register?token=${inviteToken}`;

      await this.mail.sendManagerInvite(dto.email, inviteLink);

      return user;
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new ConflictException(
          'A user with this email or phone already exists.',
        );
      }
      throw e;
    }
  }

  async createDriver(
    companyId: string,
    creatorId: string,
    dto: CreateDriverDto,
  ) {
    const phone = requireValidPhone(dto.phone);
    const hash = dto.password ? await bcrypt.hash(dto.password, 10) : null;
    try {
      const newDriver = await this.prisma.user.create({
        data: {
          name: dto.name.trim(),
          phone,
          password: hash,
          role: 'DRIVER',
          language: dto.language ?? 'EN',
          companyId,
          managerId: creatorId,
        },
      });
      const { password, ...result } = newDriver;
      return result;
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new ConflictException(
          'This phone number is already used by another driver.',
        );
      }
      throw e;
    }
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
        manager: { select: { id: true, name: true } },
        teamlead: { select: { id: true, name: true } },
        currentTruck: { select: { id: true, plate: true, status: true } },
        company: { select: { name: true } },
        _count: {
          select: {
            ratingsReceived: true,
            managerRatingsReceived: true,
          },
        },
        ratingsReceived: { select: { score: true } },
        managerRatingsReceived: { select: { score: true } },
      },
    });

    return users.map(
      ({ ratingsReceived, managerRatingsReceived, _count, ...u }) => ({
        ...u,
        ratingCount: _count.ratingsReceived,
        averageRating:
          ratingsReceived.length > 0
            ? ratingsReceived.reduce((s, r) => s + r.score, 0) /
              ratingsReceived.length
            : null,
        managerRatingCount: _count.managerRatingsReceived,
        managerAverageRating:
          managerRatingsReceived.length > 0
            ? managerRatingsReceived.reduce((s, r) => s + r.score, 0) /
              managerRatingsReceived.length
            : null,
      }),
    );
  }

  async updateDriver(
    id: string,
    companyId: string | null,
    dto: { phone?: string; managerId?: string | null; truckId?: string | null },
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
        ...(dto.managerId !== undefined ? { managerId: dto.managerId } : {}),
      },
      select: {
        id: true,
        name: true,
        phone: true,
        managerId: true,
        manager: { select: { id: true, name: true } },
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

    if (user.role === 'MANAGER' && requesterRole === 'MANAGER') {
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
        manager: {
          select: { id: true, name: true, email: true, phone: true, avatar: true },
        },
        teamlead: {
          select: { id: true, name: true, email: true, phone: true, avatar: true },
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
        managerRatingsReceived: {
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

    const rawDriver = user.ratingsReceived;
    const averageRating =
      rawDriver.length > 0
        ? rawDriver.reduce((sum, r) => sum + r.score, 0) / rawDriver.length
        : null;

    const ratingsReceived = rawDriver.map(({ anonymous, ratedBy, ...r }) => ({
      ...r,
      anonymous,
      ratedBy: anonymous
        ? { id: ratedBy.id, name: 'Anonymous', role: '' }
        : ratedBy,
    }));

    const rawManager = user.managerRatingsReceived;
    const managerAverageRating =
      rawManager.length > 0
        ? rawManager.reduce((sum, r) => sum + r.score, 0) / rawManager.length
        : null;

    const managerRatingsReceived = rawManager.map(
      ({ anonymous, ratedBy, ...r }) => ({
        ...r,
        anonymous,
        ratedBy: anonymous
          ? { id: ratedBy.id, name: 'Anonymous', role: '' }
          : ratedBy,
      }),
    );

    return {
      ...user,
      ratingsReceived,
      averageRating,
      ratingCount: rawDriver.length,
      managerRatingsReceived,
      managerAverageRating,
      managerRatingCount: rawManager.length,
    };
  }

  // ── Driver rating (manager rates driver) ─────────────────────────────
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

  // ── Manager rating (driver rates manager) ────────────────────────────
  async upsertManagerRating(
    managerId: string,
    ratedById: string,
    companyId: string,
    score: number,
    comment?: string,
    anonymous?: boolean,
  ) {
    if (score < 1 || score > 5) {
      throw new BadRequestException('Score must be between 1 and 5');
    }
    const manager = await this.prisma.user.findFirst({
      where: { id: managerId, role: 'MANAGER', companyId },
      select: { id: true },
    });
    if (!manager) throw new NotFoundException('Manager not found');

    return this.prisma.managerRating.upsert({
      where: { managerId_ratedById: { managerId, ratedById } },
      create: {
        managerId,
        ratedById,
        score,
        comment,
        anonymous: anonymous ?? false,
      },
      update: { score, comment, anonymous: anonymous ?? false },
    });
  }

  async getManagerRatings(managerId: string) {
    const ratings = await this.prisma.managerRating.findMany({
      where: { managerId },
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
      await this.storage.deleteFile(user.avatarPublicId as string);
    }

    const { url, storagePath } = await this.storage.uploadWithUrl(file, 'avatars');

    return this.prisma.user.update({
      where: { id: userId },
      data: { avatar: url, avatarPublicId: storagePath },
    });
  }

  async deleteAvatar(userId: string) {
    const user = await this.prisma.user.findFirst({ where: { id: userId } });

    if (user?.avatarPublicId) {
      await this.storage.deleteFile(user.avatarPublicId as string);
    }

    return this.prisma.user.update({
      where: { id: userId },
      data: { avatar: null, avatarPublicId: null },
    });
  }

  // ── Push tokens ───────────────────────────────────────────────────────
  // Multi-device: each Expo push token gets its own row. The token itself
  // is unique, so re-registering the same device just updates platform.
  async registerPushToken(
    userId: string,
    token: string,
    platform?: 'ios' | 'android' | 'web',
  ) {
    return this.prisma.pushToken.upsert({
      where: { token },
      create: { userId, token, platform },
      update: { userId, platform },
    });
  }

  async deletePushToken(userId: string, token: string) {
    // Scope by userId so a user can't delete someone else's token even if
    // they somehow learn it.
    await this.prisma.pushToken.deleteMany({
      where: { token, userId },
    });
    return { ok: true };
  }

  /** Store the user's IANA timezone. Used by AlarmsService to interpret
   *  wall-clock alarm times in the target's local clock. */
  async setTimezone(userId: string, timezone: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { timezone },
      select: { id: true, timezone: true },
    });
  }
}
