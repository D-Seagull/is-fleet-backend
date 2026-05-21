"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var AlarmsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AlarmsService = void 0;
const common_1 = require("@nestjs/common");
const schedule_1 = require("@nestjs/schedule");
const prisma_service_1 = require("../prisma/prisma.service");
const push_service_1 = require("../push/push.service");
const messages_gateway_1 = require("../messages/messages.gateway");
const date_fns_tz_1 = require("date-fns-tz");
function parseAlarmTime(input, tz) {
    const hasTzSuffix = /Z$|[+-]\d{2}:?\d{2}$/.test(input);
    if (hasTzSuffix)
        return new Date(input);
    return (0, date_fns_tz_1.fromZonedTime)(input, tz ?? 'UTC');
}
const ALARM_INCLUDE = {
    creator: { select: { id: true, name: true, role: true } },
    target: { select: { id: true, name: true, role: true } },
    trip: { select: { id: true, title: true, truckId: true } },
};
let AlarmsService = AlarmsService_1 = class AlarmsService {
    prisma;
    push;
    gateway;
    logger = new common_1.Logger(AlarmsService_1.name);
    constructor(prisma, push, gateway) {
        this.prisma = prisma;
        this.push = push;
        this.gateway = gateway;
    }
    async canTarget(creatorId, creatorRole, creatorCompanyId, targetUserId) {
        if (creatorId === targetUserId)
            return true;
        if (creatorRole === 'DRIVER')
            return false;
        const target = await this.prisma.user.findUnique({
            where: { id: targetUserId },
            select: { companyId: true },
        });
        if (!target)
            return false;
        return target.companyId === creatorCompanyId;
    }
    async create(creatorId, creatorRole, creatorCompanyId, dto) {
        const allowed = await this.canTarget(creatorId, creatorRole, creatorCompanyId, dto.targetUserId);
        if (!allowed) {
            throw new common_1.ForbiddenException('Cannot create alarm for that user');
        }
        if (dto.tripId) {
            const trip = await this.prisma.trip.findFirst({
                where: { id: dto.tripId, companyId: creatorCompanyId },
                select: { id: true },
            });
            if (!trip)
                throw new common_1.NotFoundException('Trip not found');
        }
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
    async findMy(userId) {
        return this.prisma.alarm.findMany({
            where: { targetUserId: userId },
            include: ALARM_INCLUDE,
            orderBy: { time: 'asc' },
        });
    }
    async findCreated(userId) {
        return this.prisma.alarm.findMany({
            where: { createdById: userId },
            include: ALARM_INCLUDE,
            orderBy: { time: 'asc' },
        });
    }
    async findByTrip(tripId, requester) {
        const trip = await this.prisma.trip.findFirst({
            where: { id: tripId, companyId: requester.companyId },
            select: { driverId: true, managerId: true },
        });
        if (!trip)
            throw new common_1.NotFoundException('Trip not found');
        const isManager = requester.role === 'ADMIN' || requester.role === 'TEAMLEAD';
        const isParticipant = trip.driverId === requester.id || trip.managerId === requester.id;
        if (!isManager && !isParticipant) {
            throw new common_1.ForbiddenException('No access to this trip');
        }
        return this.prisma.alarm.findMany({
            where: { tripId },
            include: ALARM_INCLUDE,
            orderBy: { time: 'asc' },
        });
    }
    async findByTruck(truckId, requester) {
        const truck = await this.prisma.truck.findFirst({
            where: { id: truckId, companyId: requester.companyId },
            select: { currentDriverId: true, managerId: true },
        });
        if (!truck)
            throw new common_1.NotFoundException('Truck not found');
        const targetIds = [truck.currentDriverId, truck.managerId].filter((x) => !!x);
        return this.prisma.alarm.findMany({
            where: {
                companyId: requester.companyId,
                OR: [
                    { trip: { truckId } },
                    targetIds.length > 0
                        ? { targetUserId: { in: targetIds } }
                        : { id: 'never' },
                ],
            },
            include: ALARM_INCLUDE,
            orderBy: { time: 'asc' },
        });
    }
    async update(id, userId, dto) {
        const alarm = await this.prisma.alarm.findUnique({ where: { id } });
        if (!alarm)
            throw new common_1.NotFoundException('Alarm not found');
        if (alarm.createdById !== userId) {
            throw new common_1.ForbiddenException('Only the creator can edit this alarm');
        }
        let timePatch = {};
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
    async remove(id, userId) {
        const alarm = await this.prisma.alarm.findUnique({ where: { id } });
        if (!alarm)
            throw new common_1.NotFoundException('Alarm not found');
        if (alarm.createdById !== userId && alarm.targetUserId !== userId) {
            throw new common_1.ForbiddenException('No access to this alarm');
        }
        await this.prisma.alarm.delete({ where: { id } });
        return { ok: true };
    }
    async checkAlarms() {
        const now = new Date();
        const due = await this.prisma.alarm.findMany({
            where: { time: { lte: now }, isSent: false },
            include: {
                target: { select: { id: true, name: true } },
            },
        });
        if (due.length === 0)
            return;
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
            }
            catch (e) {
                this.logger.error(`Push failed for alarm ${alarm.id}`, e);
            }
            try {
                this.gateway.server.to(alarm.targetUserId).emit('alarmFired', {
                    id: alarm.id,
                    title: alarm.title,
                    note: alarm.note,
                    tripId: alarm.tripId,
                    time: alarm.time.toISOString(),
                });
            }
            catch (e) {
                this.logger.warn(`Socket emit failed for alarm ${alarm.id}: ${e.message}`);
            }
            const next = nextFireTime(alarm.time, alarm.recurrence);
            if (next) {
                await this.prisma.alarm.update({
                    where: { id: alarm.id },
                    data: { time: next, isSent: false },
                });
            }
            else {
                await this.prisma.alarm.update({
                    where: { id: alarm.id },
                    data: { isSent: true },
                });
            }
        }
    }
};
exports.AlarmsService = AlarmsService;
__decorate([
    (0, schedule_1.Cron)('* * * * *'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AlarmsService.prototype, "checkAlarms", null);
exports.AlarmsService = AlarmsService = AlarmsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        push_service_1.PushService,
        messages_gateway_1.MessagesGateway])
], AlarmsService);
function nextFireTime(prev, recurrence) {
    if (recurrence === 'NONE')
        return null;
    const next = new Date(prev);
    if (recurrence === 'DAILY')
        next.setDate(next.getDate() + 1);
    else if (recurrence === 'WEEKLY')
        next.setDate(next.getDate() + 7);
    return next;
}
//# sourceMappingURL=alarms.service.js.map