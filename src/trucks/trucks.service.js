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
exports.TrucksService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const trip_chat_sessions_service_1 = require("../messages/trip-chat-sessions.service");
const messages_gateway_1 = require("../messages/messages.gateway");
const push_service_1 = require("../push/push.service");
const ACTIVE_TRIP_STATUSES = [
    'ASSIGNED',
    'ACCEPTED',
    'ON_WAY',
    'ON_SITE',
    'LOADED',
];
let TrucksService = class TrucksService {
    prisma;
    sessions;
    gateway;
    push;
    constructor(prisma, sessions, gateway, push) {
        this.prisma = prisma;
        this.sessions = sessions;
        this.gateway = gateway;
        this.push = push;
    }
    async create(companyId, dto) {
        return this.prisma.truck.create({
            data: {
                ...dto,
                companyId,
            },
        });
    }
    async findAll(companyId) {
        return this.prisma.truck.findMany({
            where: { companyId, isActive: true },
            include: {
                currentDriver: {
                    select: { id: true, name: true, phone: true },
                },
                manager: {
                    select: { id: true, name: true },
                },
                truckNotes: {
                    orderBy: { createdAt: 'desc' },
                    take: 1,
                    select: { content: true, createdAt: true },
                },
            },
        });
    }
    async findOne(id, companyId) {
        const truck = await this.prisma.truck.findFirst({
            where: { id, companyId },
            include: {
                currentDriver: {
                    select: { id: true, name: true, phone: true },
                },
                manager: {
                    select: { id: true, name: true },
                },
            },
        });
        if (!truck)
            throw new common_1.NotFoundException('truck not found');
        return truck;
    }
    async update(id, companyId, dto, triggeredById) {
        const oldTruck = await this.findOne(id, companyId);
        let detachedFromTruckId = null;
        if (dto.currentDriverId !== undefined &&
            dto.currentDriverId !== null &&
            dto.currentDriverId !== oldTruck.currentDriverId) {
            const previousTruck = await this.prisma.truck.findFirst({
                where: {
                    currentDriverId: dto.currentDriverId,
                    id: { not: id },
                },
                select: { id: true },
            });
            if (previousTruck) {
                await this.prisma.truck.update({
                    where: { id: previousTruck.id },
                    data: { currentDriverId: null },
                });
                detachedFromTruckId = previousTruck.id;
            }
        }
        const updated = await this.prisma.truck.update({
            where: { id },
            data: dto,
        });
        const driverChanged = dto.currentDriverId !== undefined &&
            dto.currentDriverId !== oldTruck.currentDriverId;
        if (driverChanged || detachedFromTruckId) {
            const payload = {
                truckId: id,
                previousTruckId: detachedFromTruckId,
                newDriverId: dto.currentDriverId ?? null,
                previousDriverId: oldTruck.currentDriverId ?? null,
            };
            this.gateway.server
                .to(`company-${companyId}`)
                .emit('truckChanged', payload);
            if (oldTruck.currentDriverId) {
                this.gateway.server
                    .to(oldTruck.currentDriverId)
                    .emit('truckChanged', payload);
            }
            if (dto.currentDriverId) {
                this.gateway.server
                    .to(dto.currentDriverId)
                    .emit('truckChanged', payload);
            }
            if (driverChanged && dto.currentDriverId) {
                await this.push.sendToUsers([dto.currentDriverId], {
                    title: 'Призначення вантажівки',
                    body: `Вас призначено на ${updated.plate}`,
                    data: {
                        type: 'TRUCK_REASSIGNED',
                        truckId: id,
                        plate: updated.plate,
                    },
                });
            }
        }
        const managerChanged = dto.managerId !== undefined &&
            dto.managerId !== oldTruck.managerId &&
            dto.managerId !== null;
        if (managerChanged) {
            const payload = {
                truckId: id,
                previousTruckId: null,
                newDriverId: oldTruck.currentDriverId ?? null,
                previousDriverId: oldTruck.currentDriverId ?? null,
            };
            this.gateway.server
                .to(`company-${companyId}`)
                .emit('truckChanged', payload);
            if (oldTruck.currentDriverId) {
                this.gateway.server
                    .to(oldTruck.currentDriverId)
                    .emit('truckChanged', payload);
            }
        }
        if (managerChanged) {
            const newManagerId = dto.managerId;
            const [newManager] = await Promise.all([
                this.prisma.user.findUnique({
                    where: { id: newManagerId },
                    select: { name: true },
                }),
                this.push.sendToUsers([newManagerId], {
                    title: 'Призначення вантажівки',
                    body: `Вам призначено вантажівку ${updated.plate}`,
                    data: {
                        type: 'MANAGER_ASSIGNED_TRUCK',
                        truckId: id,
                        plate: updated.plate,
                    },
                }),
            ]);
            if (oldTruck.currentDriverId) {
                await this.push.sendToUsers([oldTruck.currentDriverId], {
                    title: 'Менеджер змінений',
                    body: `Ваш новий менеджер: ${newManager?.name ?? 'без імені'}`,
                    data: {
                        type: 'MANAGER_CHANGED',
                        truckId: id,
                        managerId: newManagerId,
                    },
                });
            }
            const activeTrips = await this.prisma.trip.findMany({
                where: {
                    truckId: id,
                    status: { in: [...ACTIVE_TRIP_STATUSES] },
                },
                select: { id: true, driverId: true, managerId: true },
            });
            for (const trip of activeTrips) {
                if (trip.managerId === newManagerId)
                    continue;
                await this.prisma.trip.update({
                    where: { id: trip.id },
                    data: { managerId: newManagerId },
                });
                const { systemMessage } = await this.sessions.closeAndOpenNew(trip.id, 'MANAGER_CHANGED', trip.driverId, newManagerId, triggeredById);
                this.gateway.server.to(trip.id).emit('tripUpdated', { tripId: trip.id });
                this.gateway.server
                    .to(`company-${companyId}`)
                    .emit('tripUpdated', { tripId: trip.id });
                if (systemMessage) {
                    this.gateway.server.to(trip.id).emit('newMessage', systemMessage);
                    this.gateway.server
                        .to(`company-${companyId}`)
                        .emit('newMessage', systemMessage);
                }
            }
        }
        return updated;
    }
    async findDriverTruck(driverId) {
        return this.prisma.truck.findFirst({
            where: { currentDriverId: driverId, isActive: true },
            include: {
                manager: {
                    select: { id: true, name: true, phone: true, avatar: true },
                },
                truckNotes: {
                    orderBy: { createdAt: 'desc' },
                    include: {
                        user: { select: { id: true, name: true, role: true } },
                    },
                },
            },
        });
    }
    async findMyTrucks(userId, companyId) {
        return this.prisma.truck.findMany({
            where: { companyId, isActive: true, managerId: userId },
            include: {
                currentDriver: {
                    select: { id: true, name: true, phone: true },
                },
                truckNotes: {
                    orderBy: { createdAt: 'desc' },
                    take: 1,
                    select: { content: true, createdAt: true },
                },
            },
        });
    }
    async findDeactivated(companyId) {
        return this.prisma.truck.findMany({
            where: { companyId, isActive: false },
            include: {
                currentDriver: { select: { id: true, name: true, phone: true } },
            },
        });
    }
    async activate(id, companyId) {
        await this.prisma.truck.update({
            where: { id },
            data: { isActive: true },
        });
        return { message: 'Truck activated' };
    }
    async remove(id, companyId) {
        const truck = await this.findOne(id, companyId);
        await this.prisma.truck.update({
            where: { id },
            data: { isActive: false },
        });
        return { message: `Truck ${truck.plate} deactivated` };
    }
    async createNote(truckId, companyId, userId, dto) {
        const truck = await this.findOne(truckId, companyId);
        if (!truck)
            return;
        return this.prisma.truckNote.create({
            data: {
                truckId,
                userId,
                content: dto.content,
            },
            include: {
                user: { select: { id: true, name: true, role: true } },
            },
        });
    }
    async getNotes(truckId) {
        return this.prisma.truckNote.findMany({
            where: { truckId },
            include: {
                user: { select: { id: true, name: true, role: true } },
            },
            orderBy: { createdAt: 'desc' },
        });
    }
    async removeNote(id, userId) {
        const note = await this.prisma.truckNote.findFirst({
            where: { id, userId },
        });
        if (!note)
            throw new common_1.NotFoundException('Note not found');
        await this.prisma.truckNote.delete({ where: { id } });
        return { message: 'Note deleted' };
    }
};
exports.TrucksService = TrucksService;
exports.TrucksService = TrucksService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        trip_chat_sessions_service_1.TripChatSessionsService,
        messages_gateway_1.MessagesGateway,
        push_service_1.PushService])
], TrucksService);
//# sourceMappingURL=trucks.service.js.map