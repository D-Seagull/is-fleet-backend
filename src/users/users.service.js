"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.UsersService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const bcrypt = __importStar(require("bcrypt"));
const client_1 = require("@prisma/client");
const supabase_storage_service_1 = require("../supabase-storage/supabase-storage.service");
const uuid_1 = require("uuid");
const mail_service_1 = require("../mail/mail.service");
const phone_1 = require("../common/utils/phone");
const messages_gateway_1 = require("../messages/messages.gateway");
const push_service_1 = require("../push/push.service");
function requireValidPhone(input) {
    const canonical = (0, phone_1.normalizePhone)(input);
    if (!canonical) {
        throw new common_1.BadRequestException('Phone must be in international format, e.g. +380501234567');
    }
    return canonical;
}
let UsersService = class UsersService {
    prisma;
    storage;
    mail;
    gateway;
    push;
    constructor(prisma, storage, mail, gateway, push) {
        this.prisma = prisma;
        this.storage = storage;
        this.mail = mail;
        this.gateway = gateway;
        this.push = push;
    }
    async createManager(companyId, creatorId, dto) {
        const inviteToken = (0, uuid_1.v4)();
        const inviteExpiry = new Date();
        inviteExpiry.setDate(inviteExpiry.getDate() + 7);
        const phone = requireValidPhone(dto.phone);
        try {
            const user = await this.prisma.user.create({
                data: {
                    email: dto.email,
                    phone,
                    name: dto.name?.trim() ?? null,
                    role: 'MANAGER',
                    companyId,
                    teamleadId: creatorId,
                    language: dto.language,
                    inviteToken,
                    inviteExpiry,
                },
            });
            const inviteLink = `${process.env.FRONTEND_URL}/register?token=${inviteToken}`;
            await this.mail.sendManagerInvite(dto.email, inviteLink);
            return user;
        }
        catch (e) {
            if (e instanceof client_1.Prisma.PrismaClientKnownRequestError &&
                e.code === 'P2002') {
                throw new common_1.ConflictException('A user with this email or phone already exists.');
            }
            throw e;
        }
    }
    async createDriver(companyId, creatorId, dto) {
        const phone = requireValidPhone(dto.phone);
        const hash = dto.password ? await bcrypt.hash(dto.password, 10) : null;
        try {
            const newDriver = await this.prisma.user.create({
                data: {
                    name: dto.name.trim(),
                    phone,
                    password: hash,
                    role: 'DRIVER',
                    language: dto.language ?? 'EN',
                    companyId,
                    managerId: creatorId,
                },
            });
            const { password, ...result } = newDriver;
            return result;
        }
        catch (e) {
            if (e instanceof client_1.Prisma.PrismaClientKnownRequestError &&
                e.code === 'P2002') {
                throw new common_1.ConflictException('This phone number is already used by another driver.');
            }
            throw e;
        }
    }
    async getCompanyUsers(companyId) {
        const users = await this.prisma.user.findMany({
            where: companyId ? { companyId } : {},
            select: {
                id: true,
                name: true,
                email: true,
                phone: true,
                avatar: true,
                role: true,
                language: true,
                isActive: true,
                createdAt: true,
                managerId: true,
                teamleadId: true,
                manager: { select: { id: true, name: true } },
                teamlead: { select: { id: true, name: true } },
                currentTruck: { select: { id: true, plate: true, status: true } },
                company: { select: { name: true } },
                _count: {
                    select: {
                        ratingsReceived: true,
                        managerRatingsReceived: true,
                        assignedTrucks: true,
                    },
                },
                ratingsReceived: { select: { score: true } },
                managerRatingsReceived: { select: { score: true } },
            },
        });
        return users.map(({ ratingsReceived, managerRatingsReceived, _count, ...u }) => ({
            ...u,
            ratingCount: _count.ratingsReceived,
            averageRating: ratingsReceived.length > 0
                ? ratingsReceived.reduce((s, r) => s + r.score, 0) /
                    ratingsReceived.length
                : null,
            managerRatingCount: _count.managerRatingsReceived,
            managerAverageRating: managerRatingsReceived.length > 0
                ? managerRatingsReceived.reduce((s, r) => s + r.score, 0) /
                    managerRatingsReceived.length
                : null,
            truckCount: _count.assignedTrucks,
        }));
    }
    async updateDriver(id, companyId, dto) {
        const user = await this.prisma.user.findFirst({
            where: companyId ? { id, companyId } : { id },
        });
        if (!user)
            throw new common_1.NotFoundException('User not found');
        let truckChanged = false;
        let assignedTruckPlate = null;
        let previousTruckId = null;
        if (dto.truckId !== undefined) {
            const oldLinks = await this.prisma.truck.findMany({
                where: { currentDriverId: id },
                select: { id: true },
            });
            previousTruckId = oldLinks[0]?.id ?? null;
            await this.prisma.truck.updateMany({
                where: { currentDriverId: id },
                data: { currentDriverId: null },
            });
            if (dto.truckId) {
                await this.prisma.truck.updateMany({
                    where: {
                        id: { not: dto.truckId },
                        currentDriverId: { not: null },
                        AND: [{ currentDriverId: { equals: id } }],
                    },
                    data: { currentDriverId: null },
                });
                const newTruck = await this.prisma.truck.update({
                    where: { id: dto.truckId },
                    data: { currentDriverId: id },
                    select: { id: true, plate: true },
                });
                assignedTruckPlate = newTruck.plate;
                truckChanged = newTruck.id !== previousTruckId;
            }
            else {
                truckChanged = previousTruckId !== null;
            }
        }
        const updated = await this.prisma.user.update({
            where: { id },
            data: {
                ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
                ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
                ...(dto.language !== undefined ? { language: dto.language } : {}),
                ...(dto.managerId !== undefined ? { managerId: dto.managerId } : {}),
                ...(dto.teamleadId !== undefined ? { teamleadId: dto.teamleadId } : {}),
            },
            select: {
                id: true,
                name: true,
                phone: true,
                language: true,
                managerId: true,
                teamleadId: true,
                manager: { select: { id: true, name: true } },
                teamlead: { select: { id: true, name: true } },
                currentTruck: { select: { id: true, plate: true, status: true } },
            },
        });
        if (truckChanged && user.companyId) {
            const payload = {
                truckId: dto.truckId ?? null,
                previousTruckId,
                newDriverId: dto.truckId ? id : null,
                previousDriverId: dto.truckId ? null : id,
            };
            this.gateway.server
                .to(`company-${user.companyId}`)
                .emit('truckChanged', payload);
            this.gateway.server.to(id).emit('truckChanged', payload);
            if (dto.truckId && assignedTruckPlate) {
                await this.push.sendToUsers([id], {
                    title: 'Призначення вантажівки',
                    body: `Вас призначено на ${assignedTruckPlate}`,
                    data: {
                        type: 'TRUCK_REASSIGNED',
                        truckId: dto.truckId,
                        plate: assignedTruckPlate,
                    },
                });
            }
        }
        return updated;
    }
    async activate(id, companyId) {
        const user = await this.prisma.user.findFirst({
            where: companyId ? { id, companyId } : { id },
        });
        if (!user)
            throw new common_1.NotFoundException('User not found');
        await this.prisma.user.update({
            where: { id },
            data: { isActive: true },
        });
        return { message: `User ${user.name} activated!` };
    }
    async deactivate(id, companyId, requesterRole) {
        const user = await this.prisma.user.findFirst({
            where: companyId ? { id, companyId } : { id },
        });
        if (!user)
            throw new common_1.NotFoundException('User not found');
        if (user.role === 'TEAMLEAD' && requesterRole !== 'ADMIN') {
            throw new common_1.ForbiddenException('Only an admin can deactivate this user');
        }
        if (user.role === 'MANAGER' && requesterRole === 'MANAGER') {
            throw new common_1.ForbiddenException('You do not have permission to deactivate this user');
        }
        await this.prisma.user.update({
            where: { id },
            data: { isActive: false },
        });
        return { message: `User ${user.name} deactivated!` };
    }
    async getUserById(id) {
        const user = await this.prisma.user.findFirst({
            where: { id },
            select: {
                id: true,
                name: true,
                email: true,
                phone: true,
                avatar: true,
                role: true,
                language: true,
                isActive: true,
                teamleadId: true,
                companyId: true,
                createdAt: true,
                manager: {
                    select: { id: true, name: true, email: true, phone: true, avatar: true },
                },
                teamlead: {
                    select: { id: true, name: true, email: true, phone: true, avatar: true },
                },
                currentTruck: {
                    select: { id: true, plate: true, status: true },
                },
                assignedTrucks: {
                    where: { isActive: true },
                    select: {
                        id: true,
                        plate: true,
                        status: true,
                        currentDriver: { select: { id: true, name: true } },
                    },
                    orderBy: { plate: 'asc' },
                },
                drivers: {
                    where: { isActive: true, role: 'DRIVER' },
                    select: {
                        id: true,
                        name: true,
                        phone: true,
                        avatar: true,
                        currentTruck: { select: { id: true, plate: true } },
                    },
                    orderBy: { name: 'asc' },
                },
                ratingsReceived: {
                    select: {
                        id: true,
                        score: true,
                        comment: true,
                        anonymous: true,
                        createdAt: true,
                        ratedBy: { select: { id: true, name: true, role: true } },
                    },
                    orderBy: { createdAt: 'desc' },
                },
                managerRatingsReceived: {
                    select: {
                        id: true,
                        score: true,
                        comment: true,
                        anonymous: true,
                        createdAt: true,
                        ratedBy: { select: { id: true, name: true, role: true } },
                    },
                    orderBy: { createdAt: 'desc' },
                },
            },
        });
        if (!user)
            throw new common_1.NotFoundException('Користувач не знайдений');
        const rawDriver = user.ratingsReceived;
        const averageRating = rawDriver.length > 0
            ? rawDriver.reduce((sum, r) => sum + r.score, 0) / rawDriver.length
            : null;
        const ratingsReceived = rawDriver.map(({ anonymous, ratedBy, ...r }) => ({
            ...r,
            anonymous,
            ratedBy: anonymous
                ? { id: ratedBy.id, name: 'Anonymous', role: '' }
                : ratedBy,
        }));
        const rawManager = user.managerRatingsReceived;
        const managerAverageRating = rawManager.length > 0
            ? rawManager.reduce((sum, r) => sum + r.score, 0) / rawManager.length
            : null;
        const managerRatingsReceived = rawManager.map(({ anonymous, ratedBy, ...r }) => ({
            ...r,
            anonymous,
            ratedBy: anonymous
                ? { id: ratedBy.id, name: 'Anonymous', role: '' }
                : ratedBy,
        }));
        return {
            ...user,
            ratingsReceived,
            averageRating,
            ratingCount: rawDriver.length,
            managerRatingsReceived,
            managerAverageRating,
            managerRatingCount: rawManager.length,
        };
    }
    async upsertRating(driverId, ratedById, score, comment, anonymous) {
        return this.prisma.driverRating.upsert({
            where: { driverId_ratedById: { driverId, ratedById } },
            create: { driverId, ratedById, score, comment, anonymous: anonymous ?? false },
            update: { score, comment, anonymous: anonymous ?? false },
        });
    }
    async getDriverRatings(driverId) {
        const ratings = await this.prisma.driverRating.findMany({
            where: { driverId },
            select: {
                id: true,
                score: true,
                comment: true,
                anonymous: true,
                createdAt: true,
                ratedBy: { select: { id: true, name: true, role: true } },
            },
            orderBy: { createdAt: 'desc' },
        });
        const averageRating = ratings.length > 0
            ? ratings.reduce((s, r) => s + r.score, 0) / ratings.length
            : null;
        const masked = ratings.map(({ anonymous, ratedBy, ...r }) => ({
            ...r,
            anonymous,
            ratedBy: anonymous
                ? { id: ratedBy.id, name: 'Anonymous', role: '' }
                : ratedBy,
        }));
        return { ratings: masked, averageRating, ratingCount: ratings.length };
    }
    async upsertManagerRating(managerId, ratedById, companyId, score, comment, anonymous) {
        if (score < 1 || score > 5) {
            throw new common_1.BadRequestException('Score must be between 1 and 5');
        }
        const manager = await this.prisma.user.findFirst({
            where: { id: managerId, role: 'MANAGER', companyId },
            select: { id: true },
        });
        if (!manager)
            throw new common_1.NotFoundException('Manager not found');
        return this.prisma.managerRating.upsert({
            where: { managerId_ratedById: { managerId, ratedById } },
            create: {
                managerId,
                ratedById,
                score,
                comment,
                anonymous: anonymous ?? false,
            },
            update: { score, comment, anonymous: anonymous ?? false },
        });
    }
    async getManagerRatings(managerId) {
        const ratings = await this.prisma.managerRating.findMany({
            where: { managerId },
            select: {
                id: true,
                score: true,
                comment: true,
                anonymous: true,
                createdAt: true,
                ratedBy: { select: { id: true, name: true, role: true } },
            },
            orderBy: { createdAt: 'desc' },
        });
        const averageRating = ratings.length > 0
            ? ratings.reduce((s, r) => s + r.score, 0) / ratings.length
            : null;
        const masked = ratings.map(({ anonymous, ratedBy, ...r }) => ({
            ...r,
            anonymous,
            ratedBy: anonymous
                ? { id: ratedBy.id, name: 'Anonymous', role: '' }
                : ratedBy,
        }));
        return { ratings: masked, averageRating, ratingCount: ratings.length };
    }
    async uploadAvatar(userId, file) {
        const user = await this.prisma.user.findFirst({ where: { id: userId } });
        if (user?.avatarPublicId) {
            await this.storage.deleteFile(user.avatarPublicId);
        }
        const { url, storagePath } = await this.storage.uploadWithUrl(file, 'avatars');
        return this.prisma.user.update({
            where: { id: userId },
            data: { avatar: url, avatarPublicId: storagePath },
        });
    }
    async deleteAvatar(userId) {
        const user = await this.prisma.user.findFirst({ where: { id: userId } });
        if (user?.avatarPublicId) {
            await this.storage.deleteFile(user.avatarPublicId);
        }
        return this.prisma.user.update({
            where: { id: userId },
            data: { avatar: null, avatarPublicId: null },
        });
    }
    async registerPushToken(userId, token, platform) {
        return this.prisma.pushToken.upsert({
            where: { token },
            create: { userId, token, platform },
            update: { userId, platform },
        });
    }
    async deletePushToken(userId, token) {
        await this.prisma.pushToken.deleteMany({
            where: { token, userId },
        });
        return { ok: true };
    }
    async setTimezone(userId, timezone) {
        return this.prisma.user.update({
            where: { id: userId },
            data: { timezone },
            select: { id: true, timezone: true },
        });
    }
};
exports.UsersService = UsersService;
exports.UsersService = UsersService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        supabase_storage_service_1.SupabaseStorageService,
        mail_service_1.MailService,
        messages_gateway_1.MessagesGateway,
        push_service_1.PushService])
], UsersService);
//# sourceMappingURL=users.service.js.map