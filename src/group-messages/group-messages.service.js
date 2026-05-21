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
exports.GroupMessagesService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
let GroupMessagesService = class GroupMessagesService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async getMessages(groupId) {
        return await this.prisma.groupMessage.findMany({
            where: { groupId },
            include: {
                sender: { select: { id: true, name: true, role: true } },
            },
            orderBy: { createdAt: 'asc' },
        });
    }
    async createMessage(groupId, senderId, content) {
        return await this.prisma.groupMessage.create({
            data: { groupId, senderId, content },
            include: {
                sender: { select: { id: true, name: true, role: true } },
            },
        });
    }
};
exports.GroupMessagesService = GroupMessagesService;
exports.GroupMessagesService = GroupMessagesService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], GroupMessagesService);
//# sourceMappingURL=group-messages.service.js.map