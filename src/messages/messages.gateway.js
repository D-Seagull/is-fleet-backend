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
exports.MessagesGateway = void 0;
const websockets_1 = require("@nestjs/websockets");
const socket_io_1 = require("socket.io");
const common_1 = require("@nestjs/common");
const messages_service_1 = require("./messages.service");
const prisma_service_1 = require("../prisma/prisma.service");
const create_message_dto_1 = require("./dto/create-message.dto");
const join_trip_dto_1 = require("./dto/join-trip.dto");
const jwt_1 = require("@nestjs/jwt");
let MessagesGateway = class MessagesGateway {
    messagesService;
    jwtService;
    prisma;
    server;
    constructor(messagesService, jwtService, prisma) {
        this.messagesService = messagesService;
        this.jwtService = jwtService;
        this.prisma = prisma;
    }
    handleConnection(client) {
        try {
            const token = client.handshake.auth?.token ||
                client.handshake.query?.userId;
            if (!token)
                throw new Error('No token');
            const payload = this.jwtService.verify(token, {
                secret: process.env.JWT_SECRET,
            });
            const userId = payload.sub;
            const companyId = payload.companyId;
            const role = payload.role;
            client.data.userId = userId;
            client.data.companyId = companyId;
            client.data.role = role;
            client.data.active = true;
            void client.join(userId);
            if (companyId) {
                void client.join(`company-${companyId}`);
            }
            console.log(`[ws] ${client.id} → room:${userId} company:${companyId ?? 'n/a'}`);
        }
        catch {
            console.log(`[ws] ${client.id} connected without valid token`);
        }
    }
    handleDisconnect(client) {
        console.log(`Client disconnected: ${client.id}`);
    }
    async handleJoinTrip(client, body) {
        await client.join(body.tripId);
        console.log(`[ws] ${client.id} joined room:${body.tripId}`);
    }
    async handleTripMessage(client, dto) {
        const senderId = client.data.userId;
        console.log('[ws] sendMessage from', client.id, 'senderId=', senderId, 'dto=', dto);
        if (!senderId) {
            console.warn('[ws] sendMessage REJECTED — no senderId on socket', client.id);
            return;
        }
        try {
            const message = await this.messagesService.create(senderId, dto);
            this.server.to(dto.tripId).emit('newMessage', message);
            const companyId = client.data.companyId;
            if (companyId) {
                this.server.to(`company-${companyId}`).emit('newMessage', message);
            }
            console.log('[ws] newMessage emitted to room', dto.tripId, 'id=', message.id);
            return message;
        }
        catch (e) {
            console.error('[ws] sendMessage FAILED', e);
            throw e;
        }
    }
    async handleMarkTripRead(client, body) {
        const userId = client.data.userId;
        const userRole = client.data.role ?? '';
        if (!userId || !body?.tripId)
            return;
        const result = await this.messagesService.markTripRead(body.tripId, userId, userRole);
        if (result.messageIds.length === 0 && result.documentIds.length === 0)
            return;
        this.server.to(body.tripId).emit('tripMessagesRead', {
            tripId: body.tripId,
            readerId: userId,
            messageIds: result.messageIds,
            documentIds: result.documentIds,
        });
    }
    async handleTyping(client, body) {
        const userId = client.data.userId;
        if (!userId || !body?.tripId)
            return;
        const trip = await this.prisma.trip.findUnique({
            where: { id: body.tripId },
            select: { driverId: true, managerId: true },
        });
        if (!trip)
            return;
        if (userId !== trip.driverId && userId !== trip.managerId)
            return;
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: { id: true, name: true },
        });
        client.to(body.tripId).emit('userTyping', {
            tripId: body.tripId,
            user: { id: userId, name: user?.name ?? null },
        });
    }
    handleStopTyping(client, body) {
        const userId = client.data.userId;
        if (!userId || !body?.tripId)
            return;
        client.to(body.tripId).emit('userStopTyping', {
            tripId: body.tripId,
            userId,
        });
    }
    emitNewDocument(tripId, doc) {
        this.server.to(tripId).emit('newDocument', doc);
    }
    emitDocumentDeleted(tripId, documentId) {
        this.server.to(tripId).emit('documentDeleted', { tripId, documentId });
    }
    emitMessageDeleted(tripId, messageId) {
        this.server.to(tripId).emit('messageDeleted', { tripId, messageId });
    }
    async isUserOnline(userId) {
        if (!this.server)
            return false;
        const sockets = await this.server.in(userId).fetchSockets();
        return sockets.some((s) => s.data?.active === true);
    }
    handleAppActive(client) {
        client.data.active = true;
    }
    handleAppBackground(client) {
        client.data.active = false;
    }
};
exports.MessagesGateway = MessagesGateway;
__decorate([
    (0, websockets_1.WebSocketServer)(),
    __metadata("design:type", socket_io_1.Server)
], MessagesGateway.prototype, "server", void 0);
__decorate([
    (0, websockets_1.SubscribeMessage)('joinTrip'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket,
        join_trip_dto_1.JoinTripDto]),
    __metadata("design:returntype", Promise)
], MessagesGateway.prototype, "handleJoinTrip", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('sendMessage'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket,
        create_message_dto_1.CreateMessageDto]),
    __metadata("design:returntype", Promise)
], MessagesGateway.prototype, "handleTripMessage", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('markTripRead'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket,
        join_trip_dto_1.JoinTripDto]),
    __metadata("design:returntype", Promise)
], MessagesGateway.prototype, "handleMarkTripRead", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('typing'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket,
        join_trip_dto_1.JoinTripDto]),
    __metadata("design:returntype", Promise)
], MessagesGateway.prototype, "handleTyping", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('stopTyping'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket,
        join_trip_dto_1.JoinTripDto]),
    __metadata("design:returntype", void 0)
], MessagesGateway.prototype, "handleStopTyping", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('appActive'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket]),
    __metadata("design:returntype", void 0)
], MessagesGateway.prototype, "handleAppActive", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('appBackground'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket]),
    __metadata("design:returntype", void 0)
], MessagesGateway.prototype, "handleAppBackground", null);
exports.MessagesGateway = MessagesGateway = __decorate([
    (0, websockets_1.WebSocketGateway)({
        cors: {
            origin: (origin, cb) => {
                cb(null, true);
            },
            credentials: true,
        },
    }),
    __param(0, (0, common_1.Inject)((0, common_1.forwardRef)(() => messages_service_1.MessagesService))),
    __metadata("design:paramtypes", [messages_service_1.MessagesService,
        jwt_1.JwtService,
        prisma_service_1.PrismaService])
], MessagesGateway);
//# sourceMappingURL=messages.gateway.js.map