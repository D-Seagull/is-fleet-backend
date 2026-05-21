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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MessagesService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const translation_service_1 = require("../translation/translation.service");
const trip_chat_sessions_service_1 = require("./trip-chat-sessions.service");
const push_service_1 = require("../push/push.service");
const common_2 = require("@nestjs/common");
const messages_gateway_1 = require("./messages.gateway");
let MessagesService = class MessagesService {
    prisma;
    translation;
    sessions;
    push;
    gateway;
    constructor(prisma, translation, sessions, push, gateway) {
        this.prisma = prisma;
        this.translation = translation;
        this.sessions = sessions;
        this.push = push;
        this.gateway = gateway;
    }
    async create(senderId, dto) {
        const trip = await this.prisma.trip.findUnique({
            where: { id: dto.tripId },
            include: {
                driver: { select: { id: true, language: true } },
                manager: { select: { id: true, language: true } },
            },
        });
        if (!trip)
            throw new common_1.NotFoundException('Рейс не знайдений');
        if (senderId !== trip.driverId && senderId !== trip.managerId) {
            throw new common_1.ForbiddenException('Тільки поточний водій або менеджер можуть писати в цей чат');
        }
        let translatedContent = null;
        if (dto.translate) {
            const receiver = trip.driverId === senderId ? trip.manager : trip.driver;
            const receiverLanguage = receiver?.language || 'EN';
            const targetCode = this.translation.getLanguageCode(receiverLanguage);
            translatedContent = await this.translation.translateText(dto.content, targetCode);
        }
        const session = await this.sessions.getActiveSessionOrThrow(dto.tripId);
        const message = await this.prisma.message.create({
            data: {
                tripId: dto.tripId,
                sessionId: session.id,
                senderId,
                content: dto.content,
                translatedContent,
            },
            include: {
                sender: {
                    select: { id: true, name: true, role: true },
                },
                session: {
                    select: { driverId: true, managerId: true },
                },
            },
        });
        const recipientId = senderId === trip.driverId ? trip.managerId : trip.driverId;
        if (recipientId) {
            void (async () => {
                const online = await this.gateway.isUserOnline(recipientId);
                if (online)
                    return;
                await this.push.sendToUsers([recipientId], {
                    title: message.sender.name ?? 'Нове повідомлення',
                    body: dto.content.slice(0, 200),
                    data: {
                        type: 'MESSAGE',
                        tripId: dto.tripId,
                        messageId: message.id,
                    },
                });
            })();
        }
        return message;
    }
    async remove(id, userId, userRole) {
        const msg = await this.prisma.message.findUnique({ where: { id } });
        if (!msg)
            throw new common_1.NotFoundException('Повідомлення не знайдене');
        const isManager = ['ADMIN', 'TEAMLEAD', 'MANAGER'].includes(userRole);
        if (!isManager && msg.senderId !== userId) {
            throw new common_1.ForbiddenException('Ви не можете видалити це повідомлення');
        }
        await this.prisma.message.delete({ where: { id } });
        return { tripId: msg.tripId };
    }
    async getUnreadSummary(companyId, requesterId, requesterRole) {
        const ACTIVE_STATUSES = [
            'ASSIGNED', 'ACCEPTED', 'ON_WAY', 'ON_SITE', 'LOADED',
        ];
        const isAdminTier = requesterRole === 'ADMIN' || requesterRole === 'TEAMLEAD';
        const allUnread = await this.prisma.message.findMany({
            where: {
                trip: { companyId },
                isRead: false,
                senderId: { not: requesterId },
                ...(isAdminTier
                    ? {}
                    : {
                        session: {
                            OR: [
                                { driverId: requesterId },
                                { managerId: requesterId },
                            ],
                        },
                    }),
            },
            select: {
                id: true,
                content: true,
                createdAt: true,
                tripId: true,
                sender: { select: { name: true } },
                trip: {
                    select: {
                        status: true,
                        truckId: true,
                        truck: { select: { plate: true } },
                    },
                },
            },
            orderBy: { createdAt: 'desc' },
        });
        const truckMap = new Map();
        for (const msg of allUnread) {
            const { trip } = msg;
            const isActive = ACTIVE_STATUSES.includes(trip.status);
            const { truckId } = trip;
            if (!truckMap.has(truckId)) {
                truckMap.set(truckId, {
                    plate: trip.truck.plate,
                    activeTripUnread: 0,
                    pastTripsUnread: 0,
                    tripUnread: {},
                    latestMessage: null,
                });
            }
            const entry = truckMap.get(truckId);
            if (isActive)
                entry.activeTripUnread++;
            else
                entry.pastTripsUnread++;
            entry.tripUnread[msg.tripId] = (entry.tripUnread[msg.tripId] ?? 0) + 1;
            if (!entry.latestMessage) {
                entry.latestMessage = {
                    content: msg.content,
                    senderName: msg.sender.name ?? 'Driver',
                    tripId: msg.tripId,
                    isActiveTrip: isActive,
                    createdAt: msg.createdAt.toISOString(),
                };
            }
        }
        const items = [...truckMap.entries()]
            .map(([truckId, data]) => ({
            truckId,
            plate: data.plate,
            totalUnread: data.activeTripUnread + data.pastTripsUnread,
            activeTripUnread: data.activeTripUnread,
            pastTripsUnread: data.pastTripsUnread,
            tripUnread: data.tripUnread,
            latestMessage: data.latestMessage,
        }))
            .sort((a, b) => b.totalUnread - a.totalUnread);
        return {
            total: items.reduce((s, i) => s + i.totalUnread, 0),
            items,
        };
    }
    async getDriverUnreadSummary(driverId) {
        const ACTIVE_STATUSES = [
            'ASSIGNED', 'ACCEPTED', 'ON_WAY', 'ON_SITE', 'LOADED',
        ];
        const allUnread = await this.prisma.message.findMany({
            where: {
                trip: { driverId },
                isRead: false,
                senderId: { not: driverId },
                session: { driverId },
            },
            select: {
                id: true,
                tripId: true,
                content: true,
                createdAt: true,
                sender: { select: { name: true } },
                trip: {
                    select: {
                        status: true,
                        title: true,
                    },
                },
            },
            orderBy: { createdAt: 'desc' },
        });
        const tripMap = new Map();
        let activeTripUnread = 0;
        let pastTripsUnread = 0;
        for (const msg of allUnread) {
            const isActive = ACTIVE_STATUSES.includes(msg.trip.status);
            if (!tripMap.has(msg.tripId)) {
                tripMap.set(msg.tripId, {
                    unread: 0,
                    isActiveTrip: isActive,
                    tripTitle: msg.trip.title,
                    latestMessage: null,
                });
            }
            const entry = tripMap.get(msg.tripId);
            entry.unread++;
            if (!entry.latestMessage) {
                entry.latestMessage = {
                    content: msg.content,
                    senderName: msg.sender.name ?? 'Manager',
                    createdAt: msg.createdAt.toISOString(),
                };
            }
            if (isActive)
                activeTripUnread++;
            else
                pastTripsUnread++;
        }
        const tripUnread = {};
        const items = [...tripMap.entries()].map(([tripId, data]) => {
            tripUnread[tripId] = data.unread;
            return {
                tripId,
                unread: data.unread,
                isActiveTrip: data.isActiveTrip,
                tripTitle: data.tripTitle,
                latestMessage: data.latestMessage,
            };
        });
        return {
            total: activeTripUnread + pastTripsUnread,
            activeTripUnread,
            pastTripsUnread,
            tripUnread,
            items,
        };
    }
    async findByTrip(tripId, requester) {
        const sessionIds = await this.sessions.getVisibleSessionIds(tripId, requester);
        if (sessionIds.length === 0)
            return [];
        return this.prisma.message.findMany({
            where: { sessionId: { in: sessionIds } },
            include: {
                sender: {
                    select: { id: true, name: true, role: true },
                },
            },
            orderBy: { createdAt: 'asc' },
        });
    }
    async markTripRead(tripId, readerId, readerRole) {
        const sessionIds = await this.sessions.getVisibleSessionIds(tripId, {
            id: readerId,
            role: readerRole,
        });
        const [unreadMessages, unreadDocs] = await Promise.all([
            sessionIds.length > 0
                ? this.prisma.message.findMany({
                    where: {
                        sessionId: { in: sessionIds },
                        isRead: false,
                        senderId: { not: readerId },
                    },
                    select: { id: true },
                })
                : Promise.resolve([]),
            this.prisma.tripDocument.findMany({
                where: { tripId, isRead: false, uploadedBy: { not: readerId } },
                select: { id: true },
            }),
        ]);
        const messageIds = unreadMessages.map((m) => m.id);
        const documentIds = unreadDocs.map((d) => d.id);
        await Promise.all([
            messageIds.length > 0
                ? this.prisma.message.updateMany({
                    where: { id: { in: messageIds } },
                    data: { isRead: true },
                })
                : Promise.resolve(),
            documentIds.length > 0
                ? this.prisma.tripDocument.updateMany({
                    where: { id: { in: documentIds } },
                    data: { isRead: true },
                })
                : Promise.resolve(),
        ]);
        return { messageIds, documentIds };
    }
};
exports.MessagesService = MessagesService;
exports.MessagesService = MessagesService = __decorate([
    (0, common_1.Injectable)(),
    __param(4, (0, common_2.Inject)((0, common_2.forwardRef)(() => messages_gateway_1.MessagesGateway))),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        translation_service_1.TranslationService,
        trip_chat_sessions_service_1.TripChatSessionsService,
        push_service_1.PushService,
        messages_gateway_1.MessagesGateway])
], MessagesService);
//# sourceMappingURL=messages.service.js.map