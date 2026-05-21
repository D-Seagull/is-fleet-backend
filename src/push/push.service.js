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
var PushService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PushService = void 0;
const common_1 = require("@nestjs/common");
const expo_server_sdk_1 = require("expo-server-sdk");
const prisma_service_1 = require("../prisma/prisma.service");
let PushService = PushService_1 = class PushService {
    prisma;
    logger = new common_1.Logger(PushService_1.name);
    expo = new expo_server_sdk_1.Expo();
    constructor(prisma) {
        this.prisma = prisma;
    }
    async sendToUsers(userIds, payload) {
        if (userIds.length === 0)
            return;
        const tokens = await this.prisma.pushToken.findMany({
            where: { userId: { in: userIds } },
            select: { token: true },
        });
        this.logger.log(`Push "${payload.title}" → users=[${userIds.join(',')}] tokens=${tokens.length}`);
        if (tokens.length === 0) {
            this.logger.warn(`No push tokens for users=[${userIds.join(',')}] — recipient(s) won't receive "${payload.title}". Check that the mobile app registered a token after login.`);
            return;
        }
        const messages = [];
        const validTokens = [];
        for (const { token } of tokens) {
            if (!expo_server_sdk_1.Expo.isExpoPushToken(token)) {
                this.logger.warn(`Drop invalid token format: ${token}`);
                await this.prisma.pushToken.deleteMany({ where: { token } });
                continue;
            }
            validTokens.push(token);
            messages.push({
                to: token,
                sound: payload.sound === null ? undefined : 'default',
                title: payload.title,
                body: payload.body,
                data: payload.data,
                categoryId: payload.categoryId,
            });
        }
        const chunks = this.expo.chunkPushNotifications(messages);
        const tickets = [];
        for (const chunk of chunks) {
            try {
                const part = await this.expo.sendPushNotificationsAsync(chunk);
                tickets.push(...part);
            }
            catch (e) {
                this.logger.error('Expo push send failed', e);
            }
        }
        const okCount = tickets.filter((t) => t.status === 'ok').length;
        this.logger.log(`Push "${payload.title}" → ${okCount}/${tickets.length} accepted by Expo`);
        await Promise.all(tickets.map(async (ticket, i) => {
            if (ticket.status === 'error') {
                const code = ticket.details?.error;
                this.logger.warn(`Push ticket error: ${ticket.message ?? '?'} (code=${code ?? '?'})`);
                if (code === 'DeviceNotRegistered') {
                    const badToken = validTokens[i];
                    if (badToken) {
                        await this.prisma.pushToken.deleteMany({
                            where: { token: badToken },
                        });
                    }
                }
            }
        }));
    }
};
exports.PushService = PushService;
exports.PushService = PushService = PushService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], PushService);
//# sourceMappingURL=push.service.js.map