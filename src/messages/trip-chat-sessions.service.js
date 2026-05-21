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
Object.defineProperty(exports, "__esModule", { value: true });
exports.TripChatSessionsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
let TripChatSessionsService = class TripChatSessionsService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async getActiveSession(tripId, tx = this.prisma) {
        return tx.tripChatSession.findFirst({
            where: { tripId, endedAt: null },
        });
    }
    async getVisibleSessionIds(tripId, requester) {
        const isManager = requester.role === 'ADMIN' || requester.role === 'TEAMLEAD';
        const sessions = await this.prisma.tripChatSession.findMany({
            where: {
                tripId,
                ...(isManager
                    ? {}
                    : {
                        OR: [
                            { driverId: requester.id },
                            { managerId: requester.id },
                        ],
                    }),
            },
            select: { id: true },
        });
        return sessions.map((s) => s.id);
    }
    async getActiveSessionOrThrow(tripId, tx = this.prisma) {
        const session = await this.getActiveSession(tripId, tx);
        if (!session) {
            throw new common_1.NotFoundException('No active chat session for this trip');
        }
        return session;
    }
    async openInitial(tripId, driverId, managerId, tx = this.prisma) {
        return tx.tripChatSession.create({
            data: { tripId, driverId, managerId },
        });
    }
    async closeAndOpenNew(tripId, reason, newDriverId, newManagerId, triggeredById) {
        return this.prisma.$transaction(async (tx) => {
            const active = await this.getActiveSession(tripId, tx);
            const [driver, manager, trip] = await Promise.all([
                tx.user.findUnique({
                    where: { id: newDriverId },
                    select: { name: true },
                }),
                tx.user.findUnique({
                    where: { id: newManagerId },
                    select: { name: true },
                }),
                tx.trip.findUnique({
                    where: { id: tripId },
                    select: { truck: { select: { plate: true } } },
                }),
            ]);
            const plate = trip?.truck.plate ?? '';
            let content = '';
            if (reason === 'DRIVER_CHANGED') {
                content = `До вантажівки ${plate} призначений водій ${driver?.name ?? 'без імені'}`;
            }
            else if (reason === 'MANAGER_CHANGED') {
                content = `До вантажівки ${plate} призначений менеджер ${manager?.name ?? 'без імені'}`;
            }
            if (active) {
                await tx.tripChatSession.update({
                    where: { id: active.id },
                    data: { endedAt: new Date(), endReason: reason },
                });
            }
            const newSession = await tx.tripChatSession.create({
                data: {
                    tripId,
                    driverId: newDriverId,
                    managerId: newManagerId,
                },
            });
            let systemMessage = null;
            if (content) {
                systemMessage = await tx.message.create({
                    data: {
                        tripId,
                        sessionId: newSession.id,
                        senderId: triggeredById,
                        content,
                        isSystem: true,
                        isRead: false,
                    },
                    include: {
                        sender: { select: { id: true, name: true, role: true } },
                        session: { select: { driverId: true, managerId: true } },
                    },
                });
            }
            return { session: newSession, systemMessage };
        });
    }
    async closeActive(tripId, reason, tx = this.prisma) {
        const active = await this.getActiveSession(tripId, tx);
        if (!active)
            return null;
        return tx.tripChatSession.update({
            where: { id: active.id },
            data: { endedAt: new Date(), endReason: reason },
        });
    }
    async findArchived(tripId, requester) {
        const isManager = requester.role === 'ADMIN' || requester.role === 'TEAMLEAD';
        return this.prisma.tripChatSession.findMany({
            where: {
                tripId,
                endedAt: { not: null },
                ...(isManager
                    ? {}
                    : {
                        OR: [
                            { driverId: requester.id },
                            { managerId: requester.id },
                        ],
                    }),
            },
            include: {
                driver: { select: { id: true, name: true, role: true } },
                manager: { select: { id: true, name: true, role: true } },
            },
            orderBy: { startedAt: 'desc' },
        });
    }
    async findMessagesBySession(sessionId, requester) {
        const session = await this.prisma.tripChatSession.findUnique({
            where: { id: sessionId },
        });
        if (!session)
            throw new common_1.NotFoundException('Session not found');
        const isManager = requester.role === 'ADMIN' || requester.role === 'TEAMLEAD';
        const isParticipant = session.driverId === requester.id || session.managerId === requester.id;
        if (!isManager && !isParticipant) {
            throw new common_1.ForbiddenException('No access to this chat session');
        }
        return this.prisma.message.findMany({
            where: { sessionId },
            include: { sender: { select: { id: true, name: true, role: true } } },
            orderBy: { createdAt: 'asc' },
        });
    }
};
exports.TripChatSessionsService = TripChatSessionsService;
exports.TripChatSessionsService = TripChatSessionsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], TripChatSessionsService);
//# sourceMappingURL=trip-chat-sessions.service.js.map