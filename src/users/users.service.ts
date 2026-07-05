import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
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
import { MessagesGateway } from 'src/messages/messages.gateway';
import { PushService } from 'src/push/push.service';
import { fullName } from 'src/common/utils/full-name';

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
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private prisma: PrismaService,
    private storage: SupabaseStorageService,
    private mail: MailService,
    private gateway: MessagesGateway,
    private push: PushService,
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

    // Route guard restricts this endpoint to TEAMLEAD only, so creatorId
    // is always a TEAMLEAD — pin the new manager to them as their team
    // lead. This is what scopes chat-archive visibility for the team.
    try {
      const user = await this.prisma.user.create({
        data: {
          email: dto.email,
          phone,
          firstName: dto.firstName.trim(),
          lastName: dto.lastName?.trim() || null,
          role: 'MANAGER',
          companyId,
          teamleadId: creatorId,
          language: dto.language,
          inviteToken,
          inviteExpiry,
        },
      });

      const inviteLink = `${process.env.FRONTEND_URL}/register?token=${inviteToken}`;

      // Fire-and-forget: Gmail SMTP can be slow (especially from Render free
      // tier with cold starts) — making the manager wait for SMTP to ACK
      // froze the UI on "loading" for 30-60s. The user row is already
      // persisted; the invite link is reproducible from inviteToken so we
      // can also resend on demand. Log instead of throwing so failures stay
      // visible without breaking the response.
      void this.mail
        .sendManagerInvite(dto.email, inviteLink)
        .catch((err) =>
          this.logger.error(
            `sendManagerInvite failed for ${dto.email}: ${err?.message ?? err}`,
          ),
        );

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
          firstName: dto.firstName.trim(),
          lastName: dto.lastName?.trim() || null,
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
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        avatar: true, status: true, statusUntil: true,
        role: true,
        language: true,
        isActive: true,
        createdAt: true,
        managerId: true,
        teamleadId: true,
        manager: { select: { id: true, firstName: true, lastName: true, avatar: true } },
        teamlead: { select: { id: true, firstName: true, lastName: true, avatar: true } },
        currentTruck: { select: { id: true, plate: true, status: true } },
        company: { select: { name: true } },
        _count: {
          select: {
            ratingsReceived: true,
            managerRatingsReceived: true,
            // Trucks where this user is the assigned manager. Driver rows
            // will return 0 here — frontend should only read it for MANAGERs.
            assignedTrucks: true,
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
        truckCount: _count.assignedTrucks,
      }),
    );
  }

  async updateDriver(
    id: string,
    companyId: string | null,
    dto: {
      firstName?: string;
      lastName?: string | null;
      phone?: string;
      language?: 'UK' | 'EN' | 'PL' | 'LT' | 'UZ' | 'KZ' | 'HI' | 'RU';
      managerId?: string | null;
      teamleadId?: string | null;
      truckId?: string | null;
    },
  ) {
    const user = await this.prisma.user.findFirst({
      where: companyId ? { id, companyId } : { id },
    });
    if (!user) throw new NotFoundException('User not found');

    // Track truck change so we can emit the same socket + push notifications
    // TrucksService.update emits when a manager reassigns from the truck side.
    // Without this, assigning a truck via the driver card was a silent DB
    // write — no banner, no push, no realtime list update.
    let truckChanged = false;
    let assignedTruckPlate: string | null = null;
    let previousTruckId: string | null = null;

    if (dto.truckId !== undefined) {
      // Detach this driver from any truck they're currently linked to. Capture
      // the previous truck id so the realtime payload can hint the old card
      // to update its "no driver" state too.
      const oldLinks = await this.prisma.truck.findMany({
        where: { currentDriverId: id },
        select: { id: true },
      });
      previousTruckId = oldLinks[0]?.id ?? null;
      await this.prisma.truck.updateMany({
        where: { currentDriverId: id },
        data: { currentDriverId: null },
      });

      if (dto.truckId) {
        // The new truck may already point to a different driver — clear that
        // link first so the @unique constraint on currentDriverId doesn't
        // reject our update.
        await this.prisma.truck.updateMany({
          where: {
            id: { not: dto.truckId },
            currentDriverId: { not: null },
            AND: [{ currentDriverId: { equals: id } }],
          },
          data: { currentDriverId: null },
        });
        const newTruck = await this.prisma.truck.update({
          where: { id: dto.truckId },
          data: { currentDriverId: id },
          select: { id: true, plate: true },
        });
        assignedTruckPlate = newTruck.plate;
        truckChanged = newTruck.id !== previousTruckId;
      } else {
        // null → detach only
        truckChanged = previousTruckId !== null;
      }
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        ...(dto.firstName !== undefined ? { firstName: dto.firstName.trim() } : {}),
        ...(dto.lastName !== undefined
          ? { lastName: dto.lastName === null ? null : dto.lastName.trim() || null }
          : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
        ...(dto.language !== undefined ? { language: dto.language } : {}),
        ...(dto.managerId !== undefined ? { managerId: dto.managerId } : {}),
        ...(dto.teamleadId !== undefined ? { teamleadId: dto.teamleadId } : {}),
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        phone: true,
        language: true,
        managerId: true,
        teamleadId: true,
        manager: { select: { id: true, firstName: true, lastName: true, avatar: true } },
        teamlead: { select: { id: true, firstName: true, lastName: true, avatar: true } },
        currentTruck: { select: { id: true, plate: true, status: true } },
      },
    });

    // Realtime + push side-effects mirror TrucksService.update so both entry
    // points (truck card and driver card) feel identical.
    if (truckChanged && user.companyId) {
      const payload = {
        truckId: dto.truckId ?? null,
        previousTruckId,
        newDriverId: dto.truckId ? id : null,
        previousDriverId: dto.truckId ? null : id,
      };
      this.gateway.server
        .to(`company-${user.companyId}`)
        .emit('truckChanged', payload);
      this.gateway.server.to(id).emit('truckChanged', payload);

      if (dto.truckId && assignedTruckPlate) {
        await this.push.sendToUsers([id], {
          title: 'Призначення вантажівки',
          body: `Вас призначено на ${assignedTruckPlate}`,
          data: {
            type: 'TRUCK_REASSIGNED',
            truckId: dto.truckId,
            plate: assignedTruckPlate,
          },
        });
      }
    }

    return updated;
  }

  /**
   * Self-update — narrower than updateDriver: a user is only allowed to
   * change their own profile fields (firstName/lastName/phone/language/
   * status). Used by the web Account Settings page and any future native
   * equivalents. Phone uniqueness is enforced by Prisma; we surface 409
   * on collision. status=ONLINE always clears statusUntil so a returning
   * user can't be re-frozen by stale data.
   */
  async updateMe(
    userId: string,
    dto: {
      firstName?: string;
      lastName?: string | null;
      phone?: string;
      language?: 'UK' | 'EN' | 'PL' | 'LT' | 'UZ' | 'KZ' | 'HI' | 'RU';
      status?: 'ONLINE' | 'BUSY' | 'AWAY' | 'SLEEP' | 'VACATION';
      statusUntil?: string | null;
    },
  ) {
    const phone = dto.phone !== undefined ? requireValidPhone(dto.phone) : undefined;

    const statusPatch: {
      status?: 'ONLINE' | 'BUSY' | 'AWAY' | 'SLEEP' | 'VACATION';
      statusUntil?: Date | null;
    } = {};
    if (dto.status !== undefined) {
      statusPatch.status = dto.status;
      // ONLINE wipes any pending timer; BUSY/SLEEP respect whatever the
      // caller sent (null = indefinite).
      if (dto.status === 'ONLINE') {
        statusPatch.statusUntil = null;
      } else if (dto.statusUntil !== undefined) {
        statusPatch.statusUntil = dto.statusUntil
          ? new Date(dto.statusUntil)
          : null;
      }
    } else if (dto.statusUntil !== undefined) {
      // Updating just the timer without touching the status itself.
      statusPatch.statusUntil = dto.statusUntil
        ? new Date(dto.statusUntil)
        : null;
    }

    try {
      const updated = await this.prisma.user.update({
        where: { id: userId },
        data: {
          ...(dto.firstName !== undefined ? { firstName: dto.firstName.trim() } : {}),
          ...(dto.lastName !== undefined
            ? { lastName: dto.lastName === null ? null : dto.lastName.trim() || null }
            : {}),
          ...(phone !== undefined ? { phone } : {}),
          ...(dto.language !== undefined ? { language: dto.language } : {}),
          ...statusPatch,
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          avatar: true,
          role: true,
          language: true,
          timezone: true,
          status: true,
          statusUntil: true,
          companyId: true,
        },
      });

      // Broadcast status change so other sessions don't need a full reload
      // to pick up the new presence dot. Sent only when status or its
      // expiry actually moved — silent on plain profile edits.
      if (dto.status !== undefined || dto.statusUntil !== undefined) {
        this.gateway.server
          .to(`company-${updated.companyId}`)
          .emit('userStatusChanged', {
            userId: updated.id,
            status: updated.status,
            statusUntil: updated.statusUntil,
          });
      }

      return updated;
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new ConflictException(
          'Цей номер уже використовується іншим користувачем.',
        );
      }
      throw e;
    }
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

    return { message: `User ${fullName(user)} activated!` };
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

    return { message: `User ${fullName(user)} deactivated!` };
  }

  async getUserById(id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        avatar: true, status: true, statusUntil: true,
        role: true,
        language: true,
        isActive: true,
        teamleadId: true,
        companyId: true,
        createdAt: true,
        manager: {
          select: { id: true, firstName: true, lastName: true, avatar: true, status: true, statusUntil: true, email: true, phone: true,  },
        },
        teamlead: {
          select: { id: true, firstName: true, lastName: true, avatar: true, status: true, statusUntil: true, email: true, phone: true,  },
        },
        currentTruck: {
          select: { id: true, plate: true, status: true },
        },
        // For MANAGER pages: trucks where this user is the assigned manager.
        // Empty for non-manager rows, so it costs nothing extra to include.
        assignedTrucks: {
          where: { isActive: true },
          select: {
            id: true,
            plate: true,
            status: true,
            currentDriver: { select: { id: true, firstName: true, lastName: true, avatar: true } },
          },
          orderBy: { plate: 'asc' },
        },
        // Drivers reporting to this manager (managerId === user.id).
        drivers: {
          where: { isActive: true, role: 'DRIVER' },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
            avatar: true, status: true, statusUntil: true,
            currentTruck: { select: { id: true, plate: true } },
          },
          orderBy: { firstName: 'asc' },
        },
        ratingsReceived: {
          select: {
            id: true,
            score: true,
            comment: true,
            anonymous: true,
            createdAt: true,
            ratedBy: { select: { id: true, firstName: true, lastName: true, avatar: true, status: true, statusUntil: true, role: true } },
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
            ratedBy: { select: { id: true, firstName: true, lastName: true, avatar: true, status: true, statusUntil: true, role: true } },
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
        ? { id: ratedBy.id, firstName: 'Anonymous', lastName: null, role: '' }
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
          ? { id: ratedBy.id, firstName: 'Anonymous', lastName: null, role: '' }
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
        ratedBy: { select: { id: true, firstName: true, lastName: true, avatar: true, status: true, statusUntil: true, role: true } },
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
        ? { id: ratedBy.id, firstName: 'Anonymous', lastName: null, role: '' }
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
        ratedBy: { select: { id: true, firstName: true, lastName: true, avatar: true, status: true, statusUntil: true, role: true } },
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
        ? { id: ratedBy.id, firstName: 'Anonymous', lastName: null, role: '' }
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
