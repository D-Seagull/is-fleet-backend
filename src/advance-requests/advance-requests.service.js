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
exports.AdvanceRequestsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const mail_service_1 = require("../mail/mail.service");
const config_1 = require("@nestjs/config");
let AdvanceRequestsService = class AdvanceRequestsService {
    prisma;
    mail;
    config;
    constructor(prisma, mail, config) {
        this.prisma = prisma;
        this.mail = mail;
        this.config = config;
    }
    async create(driverId, companyId, dto) {
        const driver = await this.prisma.user.findFirst({
            where: { id: driverId },
            include: {
                manager: {
                    select: {
                        email: true,
                        teamlead: { select: { email: true } },
                    },
                },
            },
        });
        if (!driver)
            throw new common_1.NotFoundException('Водій не знайдений');
        const request = await this.prisma.advanceRequest.create({
            data: {
                driverId,
                companyId,
                amount: dto.amount,
                reason: dto.reason,
            },
        });
        const fromEmail = driver.manager?.email ?? this.config.get('MAIL_FROM');
        const toEmail = this.config.get('ACCOUNTING_EMAIL');
        const ccEmail = dto.amount >= 200
            ? [driver.manager?.teamlead?.email, driver.manager?.email]
                .filter(Boolean)
                .join(',') || null
            : (driver.manager?.email ?? null);
        await this.mail.sendAdvanceRequest(fromEmail, toEmail, ccEmail, driver.name ?? '', dto.amount, dto.reason);
        return request;
    }
    async findMyRequests(userId, role) {
        if (role === 'DRIVER') {
            return await this.prisma.advanceRequest.findMany({
                where: { driverId: userId },
                orderBy: { createdAt: 'desc' },
            });
        }
        if (role === 'MANAGER') {
            return await this.prisma.advanceRequest.findMany({
                where: {
                    driver: { managerId: userId },
                },
                include: {
                    driver: { select: { id: true, name: true } },
                },
                orderBy: { createdAt: 'desc' },
            });
        }
        if (role === 'TEAMLEAD') {
            return await this.prisma.advanceRequest.findMany({
                where: {
                    driver: { manager: { teamleadId: userId } },
                },
                include: {
                    driver: { select: { id: true, name: true } },
                },
                orderBy: { createdAt: 'desc' },
            });
        }
        return await this.prisma.advanceRequest.findMany({
            include: {
                driver: { select: { id: true, name: true } },
            },
            orderBy: { createdAt: 'desc' },
        });
    }
};
exports.AdvanceRequestsService = AdvanceRequestsService;
exports.AdvanceRequestsService = AdvanceRequestsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        mail_service_1.MailService,
        config_1.ConfigService])
], AdvanceRequestsService);
//# sourceMappingURL=advance-requests.service.js.map