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
exports.TripsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const messages_gateway_1 = require("../messages/messages.gateway");
const trip_chat_sessions_service_1 = require("../messages/trip-chat-sessions.service");
const push_service_1 = require("../push/push.service");
const tripInclude = {
    driver: { select: { id: true, name: true, phone: true } },
    truck: { select: { id: true, plate: true } },
    manager: { select: { id: true, name: true } },
    stops: { orderBy: { order: 'asc' } },
    documents: true,
};
const ACTIVE_STATUSES = ['ASSIGNED', 'ACCEPTED', 'ON_WAY', 'ON_SITE', 'LOADED'];
let TripsService = class TripsService {
    prisma;
    gateway;
    sessions;
    push;
    constructor(prisma, gateway, sessions, push) {
        this.prisma = prisma;
        this.gateway = gateway;
        this.sessions = sessions;
        this.push = push;
    }
    async create(companyId, managerId, dto) {
        const trip = await this.prisma.trip.create({
            data: {
                title: dto.title,
                managerId,
                driverId: dto.driverId,
                truckId: dto.truckId,
                companyId,
                notes: dto.notes,
                orderNumber: dto.orderNumber,
                stops: dto.stops?.length
                    ? {
                        create: dto.stops.map((s, i) => ({
                            type: s.type,
                            order: s.order ?? i,
                            address: s.address,
                            ref: s.ref,
                            coords: s.coords,
                        })),
                    }
                    : undefined,
            },
            include: tripInclude,
        });
        await this.sessions.openInitial(trip.id, trip.driverId, trip.managerId);
        const loadingStop = trip.stops.find((s) => s.type === 'LOADING');
        const address = loadingStop?.address?.trim();
        await this.push.sendToUsers([trip.driverId], {
            title: 'Нове завантаження',
            body: address ? address : trip.title,
            data: {
                type: 'NEW_TRIP',
                tripId: trip.id,
                truckId: trip.truckId,
            },
        });
        return trip;
    }
    async findAll(companyId) {
        return this.prisma.trip.findMany({
            where: { companyId },
            include: tripInclude,
            orderBy: { createdAt: 'desc' },
        });
    }
    async findByTruck(truckId, companyId) {
        return this.prisma.trip.findMany({
            where: { truckId, companyId },
            include: tripInclude,
            orderBy: { createdAt: 'desc' },
        });
    }
    async findOne(id, companyId) {
        const trip = await this.prisma.trip.findFirst({
            where: { id, companyId },
            include: tripInclude,
        });
        if (!trip)
            throw new common_1.NotFoundException('Рейс не знайдений');
        return trip;
    }
    async findMyTrips(driverId) {
        return this.prisma.trip.findMany({
            where: { driverId },
            include: tripInclude,
            orderBy: { createdAt: 'desc' },
        });
    }
    async findMyActiveTrip(driverId) {
        const active = await this.prisma.trip.findFirst({
            where: {
                driverId,
                status: { in: [...ACTIVE_STATUSES] },
                truck: { currentDriverId: driverId },
            },
            include: tripInclude,
            orderBy: { createdAt: 'desc' },
        });
        return active ?? null;
    }
    async getMessages(tripId, companyId, requester) {
        const trip = await this.prisma.trip.findFirst({
            where: { id: tripId, companyId },
        });
        if (!trip)
            throw new common_1.NotFoundException('Рейс не знайдений');
        const sessionIds = await this.sessions.getVisibleSessionIds(tripId, requester);
        if (sessionIds.length === 0)
            return [];
        return this.prisma.message.findMany({
            where: { sessionId: { in: sessionIds } },
            include: {
                sender: { select: { id: true, name: true, role: true } },
            },
            orderBy: { createdAt: 'asc' },
        });
    }
    async updateStatus(id, companyId, dto) {
        await this.findOne(id, companyId);
        return this.prisma.trip.update({
            where: { id },
            data: { status: dto.status },
        });
    }
    async updateInfo(id, companyId, dto) {
        await this.findOne(id, companyId);
        if (dto.stops !== undefined) {
            await this.prisma.tripStop.deleteMany({ where: { tripId: id } });
            if (dto.stops.length > 0) {
                await this.prisma.tripStop.createMany({
                    data: dto.stops.map((s, i) => ({
                        tripId: id,
                        type: s.type,
                        order: s.order ?? i,
                        address: s.address,
                        ref: s.ref,
                        coords: s.coords,
                    })),
                });
            }
        }
        return this.prisma.trip.update({
            where: { id },
            data: { notes: dto.notes, orderNumber: dto.orderNumber },
            include: tripInclude,
        });
    }
    async assignDriver(id, companyId, driverId, triggeredById) {
        const trip = await this.prisma.trip.findFirst({
            where: { id, companyId },
        });
        if (!trip)
            throw new common_1.NotFoundException('Рейс не знайдений');
        const driverChanged = trip.driverId !== driverId;
        const updated = await this.prisma.trip.update({
            where: { id },
            data: { driverId },
            include: tripInclude,
        });
        if (driverChanged) {
            const { systemMessage } = await this.sessions.closeAndOpenNew(id, 'DRIVER_CHANGED', driverId, trip.managerId, triggeredById);
            this.gateway.server.to(id).emit('tripUpdated', { tripId: id });
            if (trip.companyId) {
                this.gateway.server
                    .to(`company-${trip.companyId}`)
                    .emit('tripUpdated', { tripId: id });
            }
            if (systemMessage) {
                this.gateway.server.to(id).emit('newMessage', systemMessage);
                if (trip.companyId) {
                    this.gateway.server
                        .to(`company-${trip.companyId}`)
                        .emit('newMessage', systemMessage);
                }
            }
        }
        return updated;
    }
    async assignManager(id, companyId, managerId, triggeredById) {
        const trip = await this.prisma.trip.findFirst({
            where: { id, companyId },
        });
        if (!trip)
            throw new common_1.NotFoundException('Рейс не знайдений');
        const managerChanged = trip.managerId !== managerId;
        const updated = await this.prisma.trip.update({
            where: { id },
            data: { managerId },
            include: tripInclude,
        });
        if (managerChanged) {
            const { systemMessage } = await this.sessions.closeAndOpenNew(id, 'MANAGER_CHANGED', trip.driverId, managerId, triggeredById);
            this.gateway.server.to(id).emit('tripUpdated', { tripId: id });
            if (trip.companyId) {
                this.gateway.server
                    .to(`company-${trip.companyId}`)
                    .emit('tripUpdated', { tripId: id });
            }
            if (systemMessage) {
                this.gateway.server.to(id).emit('newMessage', systemMessage);
                if (trip.companyId) {
                    this.gateway.server
                        .to(`company-${trip.companyId}`)
                        .emit('newMessage', systemMessage);
                }
            }
            const [newManager] = await Promise.all([
                this.prisma.user.findUnique({
                    where: { id: managerId },
                    select: { name: true },
                }),
                this.push.sendToUsers([managerId], {
                    title: 'Призначено рейс',
                    body: updated.title,
                    data: {
                        type: 'MANAGER_ASSIGNED_TRIP',
                        tripId: id,
                        truckId: updated.truckId,
                    },
                }),
            ]);
            if (trip.driverId) {
                await this.push.sendToUsers([trip.driverId], {
                    title: 'Менеджер змінений',
                    body: `Ваш новий менеджер: ${newManager?.name ?? 'без імені'}`,
                    data: {
                        type: 'MANAGER_CHANGED',
                        tripId: id,
                        managerId,
                    },
                });
            }
        }
        return updated;
    }
    async getChatArchive(tripId, companyId, requester) {
        await this.findOne(tripId, companyId);
        return this.sessions.findArchived(tripId, requester);
    }
    async getSessionMessages(sessionId, requester) {
        return this.sessions.findMessagesBySession(sessionId, requester);
    }
    async driverUpdateStatus(id, driverId, dto) {
        const trip = await this.prisma.trip.findFirst({
            where: { id, driverId },
        });
        if (!trip)
            throw new common_1.ForbiddenException('No access to this trip');
        return this.prisma.trip.update({
            where: { id },
            data: { status: dto.status },
        });
    }
    async remove(id, companyId) {
        const trip = await this.findOne(id, companyId);
        await this.prisma.trip.delete({ where: { id } });
        return { message: `Trip ${trip.title} deleted!` };
    }
    async broadcastToMyTrucks(userId, companyId, content) {
        const trips = await this.prisma.trip.findMany({
            where: {
                companyId,
                status: { in: [...ACTIVE_STATUSES] },
                truck: { managerId: userId },
            },
        });
        const results = await Promise.all(trips.map(async (trip) => {
            const session = await this.sessions.getActiveSession(trip.id);
            if (!session)
                return null;
            const message = await this.prisma.message.create({
                data: {
                    tripId: trip.id,
                    sessionId: session.id,
                    senderId: userId,
                    content,
                },
                include: { sender: { select: { id: true, name: true, role: true } } },
            });
            this.gateway.server.to(trip.id).emit('newMessage', message);
            if (trip.driverId && trip.driverId !== userId) {
                void (async () => {
                    const online = await this.gateway.isUserOnline(trip.driverId);
                    if (online)
                        return;
                    await this.push.sendToUsers([trip.driverId], {
                        title: message.sender.name ?? 'Нове повідомлення',
                        body: content.slice(0, 200),
                        data: {
                            type: 'MESSAGE',
                            tripId: trip.id,
                            messageId: message.id,
                        },
                    });
                })();
            }
            return message;
        }));
        return { sent: results.filter(Boolean).length };
    }
};
exports.TripsService = TripsService;
exports.TripsService = TripsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        messages_gateway_1.MessagesGateway,
        trip_chat_sessions_service_1.TripChatSessionsService,
        push_service_1.PushService])
], TripsService);
//# sourceMappingURL=trips.service.js.map