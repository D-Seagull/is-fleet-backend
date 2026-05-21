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
exports.AnnouncementsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const messages_gateway_1 = require("../messages/messages.gateway");
let AnnouncementsService = class AnnouncementsService {
    prisma;
    messagesGateway;
    constructor(prisma, messagesGateway) {
        this.prisma = prisma;
        this.messagesGateway = messagesGateway;
    }
    async create(companyId, userId, dto) {
        const announcement = await this.prisma.announcement.create({
            data: {
                title: dto.title,
                content: dto.content,
                target: dto.target ?? 'ALL',
                groupId: dto.groupId,
                companyId,
                createdBy: userId,
            },
        });
        let recipients = [];
        if (dto.groupId) {
            const group = await this.prisma.group.findFirst({
                where: { id: dto.groupId },
                include: {
                    trucks: { include: { truck: { select: { currentDriverId: true } } } },
                    managers: { select: { managerId: true } },
                },
            });
            if (group?.type === 'TRUCKS') {
                recipients = group.trucks
                    .filter((t) => t.truck.currentDriverId)
                    .map((t) => ({ id: t.truck.currentDriverId }));
            }
            else if (group?.type === 'MANAGERS') {
                recipients = group.managers.map((d) => ({ id: d.managerId }));
            }
        }
        else {
            const where = { companyId };
            if (dto.target === 'ALL_DRIVERS')
                where.role = 'DRIVER';
            if (dto.target === 'ALL_MANAGERS')
                where.role = 'MANAGER';
            recipients = await this.prisma.user.findMany({
                where,
                select: { id: true },
            });
        }
        for (const recipient of recipients) {
            this.messagesGateway.server.to(recipient.id).emit('newAnnouncement', {
                title: announcement.title,
                content: announcement.content,
                createdAt: announcement.createdAt,
            });
        }
        return announcement;
    }
    async findAll(companyId, userId) {
        return this.prisma.announcement.findMany({
            where: companyId
                ? { companyId, createdBy: userId }
                : { createdBy: userId },
            include: {
                creator: { select: { id: true, name: true, role: true } },
                reads: { select: { userId: true, readAt: true } },
                group: { select: { id: true, name: true } },
            },
            orderBy: { createdAt: 'desc' },
        });
    }
    async markAsRead(announcementId, userId) {
        const existing = await this.prisma.announcementRead.findFirst({
            where: { announcementId, userId },
        });
        if (existing)
            return existing;
        return this.prisma.announcementRead.create({
            data: { announcementId, userId },
        });
    }
    async createDraft(companyId, userId, dto) {
        return this.prisma.announcementDraft.create({
            data: {
                title: dto.title,
                content: dto.content,
                target: dto.target ?? 'ALL',
                groupId: dto.groupId,
                isTemplate: dto.isTemplate ?? false,
                companyId,
                createdBy: userId,
            },
        });
    }
    async findDrafts(companyId, isTemplate = false, userId) {
        const drafts = await this.prisma.announcementDraft.findMany({
            where: companyId
                ? { companyId, isTemplate, createdBy: userId }
                : { isTemplate, createdBy: userId },
            orderBy: { createdAt: 'desc' },
        });
        return drafts;
    }
    async publishDraft(draftId, companyId, userId) {
        const draft = await this.prisma.announcementDraft.findFirst({
            where: { id: draftId },
        });
        if (!draft)
            throw new common_1.NotFoundException('Чернетка не знайдена');
        const announcement = await this.prisma.announcement.create({
            data: {
                title: draft.title,
                content: draft.content,
                target: draft.target,
                groupId: draft.groupId,
                companyId,
                createdBy: userId,
            },
        });
        if (!draft.isTemplate) {
            await this.prisma.announcementDraft.delete({ where: { id: draftId } });
        }
        return announcement;
    }
    async update(id, userId, dto) {
        const announcement = await this.prisma.announcement.findFirst({
            where: { id },
            include: {
                group: {
                    include: {
                        trucks: {
                            include: { truck: { select: { currentDriverId: true } } },
                        },
                        managers: { select: { managerId: true } },
                    },
                },
            },
        });
        if (!announcement)
            throw new common_1.NotFoundException('Оголошення не знайдено');
        if (announcement.createdBy !== userId) {
            throw new common_1.ForbiddenException('Можна редагувати тільки свої оголошення');
        }
        const updated = await this.prisma.announcement.update({
            where: { id },
            data: {
                title: dto.title,
                content: dto.content,
            },
        });
        let recipients = [];
        if (announcement.groupId && announcement.group) {
            console.log('group type:', announcement.group.type);
            if (announcement.group.type === 'TRUCKS') {
                recipients = announcement.group.trucks
                    .filter((t) => t.truck.currentDriverId)
                    .map((t) => ({ id: t.truck.currentDriverId }));
            }
            else if (announcement.group.type === 'MANAGERS') {
                recipients = announcement.group.managers.map((d) => ({
                    id: d.managerId,
                }));
            }
        }
        else {
            const where = { companyId: announcement.companyId };
            if (announcement.target === 'ALL_DRIVERS')
                where.role = 'DRIVER';
            if (announcement.target === 'ALL_MANAGERS')
                where.role = 'MANAGER';
            console.log('target:', announcement.target);
            console.log('where:', where);
            recipients = await this.prisma.user.findMany({
                where,
                select: { id: true },
            });
        }
        console.log('recipients:', recipients);
        for (const recipient of recipients) {
            console.log('emitting to:', recipient.id);
            this.messagesGateway.server.to(recipient.id).emit('announcementUpdated', {
                id: updated.id,
                title: updated.title,
                content: updated.content,
                updatedAt: new Date(),
            });
        }
        return updated;
    }
    async removeDraft(id) {
        const draft = await this.prisma.announcementDraft.findFirst({
            where: { id },
        });
        if (!draft)
            throw new common_1.NotFoundException('Чернетка не знайдена');
        await this.prisma.announcementDraft.delete({ where: { id } });
        return { message: 'Чернетка видалена' };
    }
};
exports.AnnouncementsService = AnnouncementsService;
exports.AnnouncementsService = AnnouncementsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        messages_gateway_1.MessagesGateway])
], AnnouncementsService);
//# sourceMappingURL=announcements.service.js.map