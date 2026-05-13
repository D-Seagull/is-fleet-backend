import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { AlarmRecurrence } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { PushService } from 'src/push/push.service';
import { CreateAlarmDto } from './dto/create-alarm.dto';
import { UpdateAlarmDto } from './dto/update-alarm.dto';
import { MessagesGateway } from 'src/messages/messages.gateway';
import { fromZonedTime } from 'date-fns-tz';

/**
 * Parses the client-supplied `time` as wall-clock in the given IANA timezone.
 *
 * - If the string carries a timezone marker (`Z` or `±HH:MM`) → respect it
 *   (already absolute, no conversion).
 * - Otherwise (e.g. "2026-05-09T14:00:00") → interpret as wall-clock in `tz`.
 *   Falls back to UTC when `tz` is missing.
 */
function parseAlarmTime(input: string, tz: string | null | undefined): Date {
  const hasTzSuffix = /Z$|[+-]\d{2}:?\d{2}$/.test(input);
  if (hasTzSuffix) return new Date(input);
  return fromZonedTime(input, tz ?? 'UTC');
}

const ALARM_INCLUDE = {
  creator: { select: { id: true, name: true, role: true } },
  target: { select: { id: true, name: true, role: true } },
  trip: { select: { id: true, title: true, truckId: true } },
} as const;

@Injectable()
export class AlarmsService {
  private readonly logger = new Logger(AlarmsService.name);

  constructor(
    private prisma: PrismaService,
    private push: PushService,
    private gateway: MessagesGateway,
  ) {}

  /** Returns true if `creator` can schedule an alarm for `target`. */
  private async canTarget(
    creatorId: string,
    creatorRole: string,
    creatorCompanyId: string,
    targetUserId: string,
  ): Promise<boolean> {
    if (creatorId === targetUserId) return true;
    if (creatorRole === 'DRIVER') return false; // driver only self
    const target = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: { companyId: true },
    });
    if (!target) return false;
    return target.companyId === creatorCompanyId;
  }

  async create(
    creatorId: string,
    creatorRole: string,
    creatorCompanyId: string,
    dto: CreateAlarmDto,
  ) {
    const allowed = await this.canTarget(
      creatorId,
      creatorRole,
      creatorCompanyId,
      dto.targetUserId,
    );
    if (!allowed) {
      throw new ForbiddenException('Cannot create alarm for that user');
    }

    if (dto.tripId) {
      const trip = await this.prisma.trip.findFirst({
        where: { id: dto.tripId, companyId: creatorCompanyId },
        select: { id: true },
      });
      if (!trip) throw new NotFoundException('Trip not found');
    }

    // Resolve the alarm's absolute moment using the target's timezone — so a
    // dispatcher who types "08:00" really means "08:00 on the driver's clock".
    const target = await this.prisma.user.findUnique({
      where: { id: dto.targetUserId },
      select: { timezone: true },
    });
    const tz = target?.timezone ?? null;

    return this.prisma.alarm.create({
      data: {
        companyId: creatorCompanyId,
        createdById: creatorId,
        targetUserId: dto.targetUserId,
        tripId: dto.tripId ?? null,
        title: dto.title,
        note: dto.note ?? null,
        time: parseAlarmTime(dto.time, tz),
        recurrence: dto.recurrence ?? 'NONE',
      },
      include: ALARM_INCLUDE,
    });
  }

  /** Alarms targeted at the requester (their inbox). */
  async findMy(userId: string) {
    return this.prisma.alarm.findMany({
      where: { targetUserId: userId },
      include: ALARM_INCLUDE,
      orderBy: { time: 'asc' },
    });
  }

  /** Alarms the requester has scheduled (incl. for self). */
  async findCreated(userId: string) {
    return this.prisma.alarm.findMany({
      where: { createdById: userId },
      include: ALARM_INCLUDE,
      orderBy: { time: 'asc' },
    });
  }

  /** Alarms attached to a specific trip — visible to participants and managers. */
  async findByTrip(
    tripId: string,
    requester: { id: string; role: string; companyId: string },
  ) {
    const trip = await this.prisma.trip.findFirst({
      where: { id: tripId, companyId: requester.companyId },
      select: { driverId: true, dispatcherId: true },
    });
    if (!trip) throw new NotFoundException('Trip not found');

    const isManager =
      requester.role === 'ADMIN' || requester.role === 'TEAMLEAD';
    const isParticipant =
      trip.driverId === requester.id || trip.dispatcherId === requester.id;
    if (!isManager && !isParticipant) {
      throw new ForbiddenException('No access to this trip');
    }

    return this.prisma.alarm.findMany({
      where: { tripId },
      include: ALARM_INCLUDE,
      orderBy: { time: 'asc' },
    });
  }

  /** All alarms for a truck — based on trips that touch this truck OR
   *  alarms targeted at the truck's current driver/dispatcher. */
  async findByTruck(
    truckId: string,
    requester: { id: string; role: string; companyId: string },
  ) {
    const truck = await this.prisma.truck.findFirst({
      where: { id: truckId, companyId: requester.companyId },
      select: { currentDriverId: true, dispatcherId: true },
    });
    if (!truck) throw new NotFoundException('Truck not found');

    const targetIds = [truck.currentDriverId, truck.dispatcherId].filter(
      (x): x is string => !!x,
    );

    return this.prisma.alarm.findMany({
      where: {
        companyId: requester.companyId,
        OR: [
          { trip: { truckId } },
          targetIds.length > 0
            ? { targetUserId: { in: targetIds } }
            : { id: 'never' }, // empty fallback
        ],
      },
      include: ALARM_INCLUDE,
      orderBy: { time: 'asc' },
    });
  }

  async update(id: string, userId: string, dto: UpdateAlarmDto) {
    const alarm = await this.prisma.alarm.findUnique({ where: { id } });
    if (!alarm) throw new NotFoundException('Alarm not found');
    if (alarm.createdById !== userId) {
      throw new ForbiddenException('Only the creator can edit this alarm');
    }

    let timePatch: { time: Date; isSent: false } | Record<string, never> = {};
    if (dto.time !== undefined) {
      const target = await this.prisma.user.findUnique({
        where: { id: alarm.targetUserId },
        select: { timezone: true },
      });
      timePatch = {
        time: parseAlarmTime(dto.time, target?.timezone ?? null),
        isSent: false,
      };
    }

    return this.prisma.alarm.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.note !== undefined ? { note: dto.note } : {}),
        ...timePatch,
        ...(dto.recurrence !== undefined ? { recurrence: dto.recurrence } : {}),
      },
      include: ALARM_INCLUDE,
    });
  }

  /** Either creator OR target may dismiss/delete an alarm. */
  async remove(id: string, userId: string) {
    const alarm = await this.prisma.alarm.findUnique({ where: { id } });
    if (!alarm) throw new NotFoundException('Alarm not found');
    if (alarm.createdById !== userId && alarm.targetUserId !== userId) {
      throw new ForbiddenException('No access to this alarm');
    }
    await this.prisma.alarm.delete({ where: { id } });
    return { ok: true };
  }

  // ── Cron: fire due alarms once per minute ────────────────────────────
  @Cron('* * * * *')
  async checkAlarms() {
    const now = new Date();
    const due = await this.prisma.alarm.findMany({
      where: { time: { lte: now }, isSent: false },
      include: {
        target: { select: { id: true, name: true } },
      },
    });
    if (due.length === 0) return;

    for (const alarm of due) {
      try {
        await this.push.sendToUsers([alarm.targetUserId], {
          title: alarm.title,
          body: alarm.note ?? '',
          data: {
            type: 'ALARM',
            alarmId: alarm.id,
            tripId: alarm.tripId,
          },
        });
      } catch (e) {
        this.logger.error(`Push failed for alarm ${alarm.id}`, e as Error);
      }

      // Socket — for web clients (no Expo push). Emit to the target's
      // personal room so a logged-in dispatcher gets a modal in the browser.
      try {
        this.gateway.server.to(alarm.targetUserId).emit('alarmFired', {
          id: alarm.id,
          title: alarm.title,
          note: alarm.note,
          tripId: alarm.tripId,
          time: alarm.time.toISOString(),
        });
      } catch (e) {
        this.logger.warn(
          `Socket emit failed for alarm ${alarm.id}: ${(e as Error).message}`,
        );
      }

      // Recurring alarms re-fire on the next interval; one-shot get marked sent.
      const next = nextFireTime(alarm.time, alarm.recurrence);
      if (next) {
        await this.prisma.alarm.update({
          where: { id: alarm.id },
          data: { time: next, isSent: false },
        });
      } else {
        await this.prisma.alarm.update({
          where: { id: alarm.id },
          data: { isSent: true },
        });
      }
    }
  }
}

function nextFireTime(prev: Date, recurrence: AlarmRecurrence): Date | null {
  if (recurrence === 'NONE') return null;
  const next = new Date(prev);
  if (recurrence === 'DAILY') next.setDate(next.getDate() + 1);
  else if (recurrence === 'WEEKLY') next.setDate(next.getDate() + 7);
  return next;
}
