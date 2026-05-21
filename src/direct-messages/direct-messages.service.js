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
exports.DirectMessagesService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
let DirectMessagesService = class DirectMessagesService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    getMessages(userId1, userId2) {
        return this.prisma.directMessage.findMany({
            where: {
                OR: [
                    { senderId: userId1, receiverId: userId2 },
                    { senderId: userId2, receiverId: userId1 },
                ],
            },
            include: {
                sender: {
                    select: { id: true, name: true, role: true },
                },
            },
            orderBy: { createdAt: 'asc' },
        });
    }
    createMessage(senderId, receiverId, content) {
        return this.prisma.directMessage.create({
            data: { senderId, receiverId, content },
            include: {
                sender: {
                    select: { id: true, name: true, role: true },
                },
            },
        });
    }
    async getConversations(userId) {
        const messages = await this.prisma.directMessage.findMany({
            where: {
                OR: [{ senderId: userId }, { receiverId: userId }],
            },
            include: {
                sender: { select: { id: true, name: true, role: true } },
                receiver: { select: { id: true, name: true, role: true } },
            },
            orderBy: { createdAt: 'desc' },
        });
        const conversations = new Map();
        messages.forEach((msg) => {
            const otherId = msg.senderId === userId ? msg.receiverId : msg.senderId;
            if (!conversations.has(otherId)) {
                conversations.set(otherId, {
                    user: msg.senderId === userId ? msg.receiver : msg.sender,
                    lastMessage: msg,
                    unreadCount: 0,
                });
            }
        });
        for (const [otherId, conv] of conversations) {
            conv.unreadCount = await this.prisma.directMessage.count({
                where: {
                    senderId: otherId,
                    receiverId: userId,
                    isRead: false,
                },
            });
        }
        return Array.from(conversations.values());
    }
    async markAsRead(userId, senderId) {
        return this.prisma.directMessage.updateMany({
            where: {
                senderId,
                receiverId: userId,
                isRead: false,
            },
            data: { isRead: true },
        });
    }
    async getUnreadCount(userId, senderId) {
        return this.prisma.directMessage.count({
            where: {
                senderId,
                receiverId: userId,
                isRead: false,
            },
        });
    }
};
exports.DirectMessagesService = DirectMessagesService;
exports.DirectMessagesService = DirectMessagesService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], DirectMessagesService);
//# sourceMappingURL=direct-messages.service.js.map