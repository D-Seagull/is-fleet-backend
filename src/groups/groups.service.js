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
exports.GroupsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
let GroupsService = class GroupsService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async create(companyId, userId, role, dto) {
        if (dto.type === 'MANAGERS' && role === 'MANAGER') {
            throw new common_1.ForbiddenException('Менеджер не може створювати групи менеджерів');
        }
        if (dto.type === 'TRUCKS' && role === 'TEAMLEAD') {
            throw new common_1.ForbiddenException('Тімлід не може створювати групи вантажівок');
        }
        return await this.prisma.group.create({
            data: {
                name: dto.name,
                type: dto.type,
                companyId,
                createdBy: userId,
            },
        });
    }
    async findAll(companyId, _role, _userId) {
        return await this.prisma.group.findMany({
            where: companyId ? { companyId } : {},
            include: {
                creator: { select: { id: true, name: true, role: true } },
                trucks: { include: { truck: true } },
                managers: {
                    include: { manager: { select: { id: true, name: true } } },
                },
            },
        });
    }
    async update(id, userId, role, dto) {
        const group = await this.prisma.group.findFirst({ where: { id } });
        if (!group)
            throw new common_1.NotFoundException('Група не знайдена');
        if (role === 'MANAGER' && group.createdBy !== userId) {
            throw new common_1.ForbiddenException('Можна редагувати тільки свої групи');
        }
        return this.prisma.group.update({
            where: { id },
            data: { name: dto.name },
        });
    }
    async remove(id, userId, role) {
        const group = await this.prisma.group.findFirst({ where: { id } });
        if (!group)
            throw new common_1.NotFoundException('Група не знайдена');
        if (role === 'MANAGER' && group.createdBy !== userId) {
            throw new common_1.ForbiddenException('Можна видаляти тільки свої групи');
        }
        await this.prisma.group.delete({ where: { id } });
        return { message: `Група ${group.name} видалена` };
    }
    async addTruck(groupId, truckId, userId, role) {
        const group = await this.prisma.group.findFirst({ where: { id: groupId } });
        if (!group)
            throw new common_1.NotFoundException('Група не знайдена');
        if (role === 'MANAGER' && group.createdBy !== userId) {
            throw new common_1.ForbiddenException('Можна редагувати тільки свої групи');
        }
        if (group.type !== 'TRUCKS') {
            throw new common_1.ForbiddenException('Це група менеджерів — не можна додавати вантажівки');
        }
        return this.prisma.groupTruck.create({
            data: { groupId, truckId },
        });
    }
    async removeTruck(groupId, truckId, userId, role) {
        const groupTruck = await this.prisma.groupTruck.findFirst({
            where: { groupId, truckId },
        });
        if (!groupTruck)
            throw new common_1.NotFoundException('Вантажівка не знайдена в групі');
        const group = await this.prisma.group.findFirst({ where: { id: groupId } });
        if (role === 'MANAGER' && group.createdBy !== userId) {
            throw new common_1.ForbiddenException('Можна редагувати тільки свої групи');
        }
        await this.prisma.groupTruck.delete({ where: { id: groupTruck.id } });
        return { message: 'Вантажівка видалена з групи' };
    }
    async addManager(groupId, managerId) {
        const group = await this.prisma.group.findFirst({ where: { id: groupId } });
        if (!group)
            throw new common_1.NotFoundException('Група не знайдена');
        if (group.type !== 'MANAGERS') {
            throw new common_1.ForbiddenException('Це група вантажівок — не можна додавати менеджерів');
        }
        const user = await this.prisma.user.findFirst({
            where: { id: managerId },
        });
        if (!user || user.role !== 'MANAGER') {
            throw new common_1.ForbiddenException('Можна додавати тільки менеджерів');
        }
        return this.prisma.groupManager.create({
            data: { groupId, managerId },
        });
    }
    async removeManager(groupId, managerId) {
        const groupManager = await this.prisma.groupManager.findFirst({
            where: { groupId, managerId },
        });
        if (!groupManager)
            throw new common_1.NotFoundException('Менеджер не знайдений в групі');
        await this.prisma.groupManager.delete({
            where: { id: groupManager.id },
        });
        return { message: 'Менеджер видалений з групи' };
    }
    async findAllTrucksGroups(companyId) {
        return await this.prisma.group.findMany({
            where: companyId ? { companyId, type: 'TRUCKS' } : { type: 'TRUCKS' },
            include: {
                creator: { select: { id: true, name: true, role: true } },
                trucks: {
                    include: {
                        truck: {
                            select: {
                                id: true,
                                plate: true,
                                status: true,
                                currentDriver: { select: { id: true, name: true } },
                            },
                        },
                    },
                },
            },
        });
    }
    async findAllManagersGroups(companyId, role, userId) {
        const where = companyId
            ? { companyId, type: 'MANAGERS' }
            : { type: 'MANAGERS' };
        if (role === 'MANAGER' && userId) {
            where.managers = { some: { managerId: userId } };
        }
        return await this.prisma.group.findMany({
            where,
            include: {
                creator: { select: { id: true, name: true, role: true } },
                managers: {
                    include: {
                        manager: { select: { id: true, name: true } },
                    },
                },
            },
        });
    }
};
exports.GroupsService = GroupsService;
exports.GroupsService = GroupsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], GroupsService);
//# sourceMappingURL=groups.service.js.map