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
exports.DirectMessagesGateway = void 0;
const websockets_1 = require("@nestjs/websockets");
const socket_io_1 = require("socket.io");
const jwt_1 = require("@nestjs/jwt");
const direct_messages_service_1 = require("./direct-messages.service");
const group_messages_service_1 = require("../group-messages/group-messages.service");
let DirectMessagesGateway = class DirectMessagesGateway {
    service;
    groupService;
    jwt;
    server;
    constructor(service, groupService, jwt) {
        this.service = service;
        this.groupService = groupService;
        this.jwt = jwt;
    }
    async handleConnection(client) {
        try {
            const token = client.handshake.auth?.token ||
                client.handshake.query?.userId;
            console.log('Received token:', token ? 'exists' : 'missing');
            if (!token)
                throw new Error('No token');
            const payload = this.jwt.verify(token);
            if (!client.data.userId)
                client.data.userId = payload.sub;
            await client.join(`user:${payload.sub}`);
            console.log(`✅ User ${payload.sub} connected`);
        }
        catch (e) {
            console.log(`[dm-gateway] auth failed for ${client.id}: ${e.message}`);
        }
    }
    handleDisconnect(client) {
        console.log(`❌ User ${client.data.userId} disconnected`);
    }
    async handleMessage(client, data) {
        const senderId = client.data.userId;
        const message = await this.service.createMessage(senderId, data.receiverId, data.content);
        this.server.to(`user:${senderId}`).emit('new_direct_message', message);
        this.server
            .to(`user:${data.receiverId}`)
            .emit('new_direct_message', message);
        return message;
    }
    handleTypingStart(client, data) {
        this.server
            .to(`user:${data.receiverId}`)
            .emit('user_typing', { userId: client.data.userId });
    }
    handleTypingStop(client, data) {
        this.server
            .to(`user:${data.receiverId}`)
            .emit('user_stopped_typing', { userId: client.data.userId });
    }
    async handleMarkAsRead(client, data) {
        console.log('mark_as_read received:', data);
        await this.service.markAsRead(client.data.userId, data.senderId);
        console.log('marked as read, notifying:', data.senderId);
        this.server
            .to(`user:${data.senderId}`)
            .emit('messages_read', { readBy: client.data.userId });
        console.log('messages_read emitted to:', `user:${data.senderId}`);
    }
    async handleJoinGroup(client, data) {
        await client.join(`group:${data.groupId}`);
    }
    async handleLeaveGroup(client, data) {
        await client.leave(`group:${data.groupId}`);
    }
    async handleGroupMessage(client, data) {
        console.log(`💬 send_group_message from ${client.data.userId} to group ${data.groupId}`);
        const senderId = client.data.userId;
        const message = await this.groupService.createMessage(data.groupId, senderId, data.content);
        this.server.to(`group:${data.groupId}`).emit('new_group_message', message);
        return message;
    }
    handleGroupTyping(client, data) {
        client.to(`group:${data.groupId}`).emit('group_typing', {
            userId: client.data.userId,
            name: data.name,
        });
    }
    handleGroupStoppedTyping(client, data) {
        client.to(`group:${data.groupId}`).emit('group_stopped_typing', {
            userId: client.data.userId,
        });
    }
};
exports.DirectMessagesGateway = DirectMessagesGateway;
__decorate([
    (0, websockets_1.WebSocketServer)(),
    __metadata("design:type", socket_io_1.Server)
], DirectMessagesGateway.prototype, "server", void 0);
__decorate([
    (0, websockets_1.SubscribeMessage)('send_direct_message'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], DirectMessagesGateway.prototype, "handleMessage", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('typing_start'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], DirectMessagesGateway.prototype, "handleTypingStart", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('typing_stop'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], DirectMessagesGateway.prototype, "handleTypingStop", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('mark_as_read'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], DirectMessagesGateway.prototype, "handleMarkAsRead", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('join_group'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], DirectMessagesGateway.prototype, "handleJoinGroup", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('leave_group'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], DirectMessagesGateway.prototype, "handleLeaveGroup", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('send_group_message'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], DirectMessagesGateway.prototype, "handleGroupMessage", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('group_typing'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], DirectMessagesGateway.prototype, "handleGroupTyping", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('group_stopped_typing'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], DirectMessagesGateway.prototype, "handleGroupStoppedTyping", null);
exports.DirectMessagesGateway = DirectMessagesGateway = __decorate([
    (0, websockets_1.WebSocketGateway)({ cors: { origin: '*' } }),
    __metadata("design:paramtypes", [direct_messages_service_1.DirectMessagesService,
        group_messages_service_1.GroupMessagesService,
        jwt_1.JwtService])
], DirectMessagesGateway);
//# sourceMappingURL=direct-messages.gateway.js.map